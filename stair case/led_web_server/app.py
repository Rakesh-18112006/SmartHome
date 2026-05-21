import time
import json
import os
import threading
import queue
from flask import Flask, render_template
from flask_socketio import SocketIO
import paho.mqtt.client as mqtt

app = Flask(__name__)
app.config['SECRET_KEY'] = 'staircase_secret'
socketio = SocketIO(app, async_mode='threading', cors_allowed_origins="*")

# ==================== CONFIGURATION ====================
MQTT_BROKER = "35.154.62.193"
MQTT_PORT = 1883
TOTAL_STEPS = 8       # Change to 30 for full staircase

settings = {
    "maxBrightness": 255,
    "fadeTime": 0.8,      # seconds for one step to fully fade
    "stepGap": 0.25,      # seconds between each step starting
    "fps": 30,            # animation frame rate
    "autoOffTimeout": 20  # seconds before auto-off
}

# ==================== MQTT ENGINE ====================
mqtt_queue = queue.Queue()
mqtt_connected = False
last_published = {}  # track last brightness per step to avoid redundant publishes

def on_connect(client, userdata, flags, rc):
    global mqtt_connected
    mqtt_connected = True
    print(f"[MQTT] Connected rc={rc}")
    socketio.emit('sys_status', {'mqtt': True})
    # Subscribe to trigger topic to support external physical triggers
    client.subscribe("smart_home/staircase/trigger")

def on_disconnect(client, userdata, rc):
    global mqtt_connected
    mqtt_connected = False
    print("[MQTT] Disconnected")
    socketio.emit('sys_status', {'mqtt': False})

def on_message(client, userdata, msg):
    try:
        topic = msg.topic
        payload = json.loads(msg.payload.decode('utf-8'))
        
        # Handle incoming MQTT triggers (e.g. from PIR motion sensors)
        if topic == "smart_home/staircase/trigger":
            cmd = payload.get("trigger", "")
            print(f"[MQTT Trigger Received] {cmd}")
            
            if cmd == 'UP':
                start_animation('UP')
            elif cmd == 'DOWN':
                start_animation('DOWN')
            elif cmd in ['OFF', 'OFF_UP', 'OFF_DOWN', 'EMERGENCY_OFF']:
                emergency_off()
                
            socketio.emit('mqtt_log', {
                'topic': topic,
                'payload': payload,
                'status': 'ok (triggered local animation)',
                't': time.strftime("%H:%M:%S")
            })
    except Exception as e:
        print(f"[MQTT] on_message error: {e}")

# Unique client ID prevents Flask reloader from causing two clients with the same ID
mqtt_client = mqtt.Client(f"staircase_ctrl_{os.getpid()}")
mqtt_client.on_connect = on_connect
mqtt_client.on_disconnect = on_disconnect
mqtt_client.on_message = on_message

try:
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_start()
except Exception as e:
    print(f"[MQTT] Init error: {e}")

def mqtt_worker():
    """Dedicated thread that drains the queue and publishes with QoS 1."""
    while True:
        task = mqtt_queue.get()
        topic = task['topic']
        payload = task['payload']

        for attempt in range(3):
            if not mqtt_connected:
                time.sleep(0.5)
                continue
            try:
                info = mqtt_client.publish(topic, json.dumps(payload), qos=1)
                info.wait_for_publish(timeout=2.0)
                if info.is_published():
                    socketio.emit('mqtt_log', {
                        'topic': topic,
                        'payload': payload,
                        'status': 'ok',
                        't': time.strftime("%H:%M:%S")
                    })
                    break
            except Exception:
                time.sleep(0.3)
        else:
            socketio.emit('mqtt_log', {
                'topic': topic,
                'payload': payload,
                'status': 'fail',
                't': time.strftime("%H:%M:%S")
            })
        mqtt_queue.task_done()

threading.Thread(target=mqtt_worker, daemon=True).start()

def publish_step(step, brightness):
    """Queue a brightness command for a single global step."""
    # Skip if unchanged
    if last_published.get(step) == brightness:
        return
    last_published[step] = brightness

    node = ((step - 1) // 4) + 1
    channel = ((step - 1) % 4) + 1
    topic = f"smart_home/staircase/node{node}/command"
    mqtt_queue.put({'topic': topic, 'payload': {"channel": channel, "brightness": brightness}})

def publish_all_off():
    """Immediately queue brightness 0 for every step on every node."""
    num_nodes = (TOTAL_STEPS + 3) // 4
    for n in range(1, num_nodes + 1):
        topic = f"smart_home/staircase/node{n}/command"
        mqtt_queue.put({'topic': topic, 'payload': {"channels": [0, 0, 0, 0]}})
    for s in range(1, TOTAL_STEPS + 1):
        last_published[s] = 0

# ==================== FRAME-BASED ANIMATION ENGINE ====================
anim_lock = threading.Lock()
stop_anim = threading.Event()
anim_thread = None
auto_off_timer = None
current_state = "IDLE"

def smoothstep(t):
    """Attempt a smooth S-curve: t * t * (3 - 2t)"""
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)

def run_animation(steps_order, target_brightness, direction_label):
    """
    Frame-based overlapping fade animation.
    Each step starts fading `stepGap` seconds after the previous one.
    Fade duration per step is `fadeTime` seconds.
    Runs at `fps` frames per second.
    """
    global current_state

    fade_time = settings["fadeTime"]
    step_gap = settings["stepGap"]
    fps = settings["fps"]
    max_b = target_brightness

    current_state = f"ANIMATING_{direction_label}"
    socketio.emit('state_update', {'state': current_state})

    num = len(steps_order)
    # Total animation duration: last step starts at (num-1)*step_gap, then fades for fade_time
    total_duration = (num - 1) * step_gap + fade_time
    frame_interval = 1.0 / fps

    # Starting brightness for each step (what it is right now)
    start_brightness = {}
    for s in steps_order:
        start_brightness[s] = last_published.get(s, 0)

    t0 = time.monotonic()

    while not stop_anim.is_set():
        elapsed = time.monotonic() - t0
        if elapsed > total_duration:
            break

        vis_data = {}
        for idx, step in enumerate(steps_order):
            step_start = idx * step_gap
            progress = (elapsed - step_start) / fade_time
            progress = max(0.0, min(1.0, progress))
            smooth_p = smoothstep(progress)

            sb = start_brightness[step]
            brightness = int(sb + (max_b - sb) * smooth_p)
            brightness = max(0, min(255, brightness))

            publish_step(step, brightness)
            vis_data[step] = brightness

        socketio.emit('vis_update', vis_data)
        time.sleep(frame_interval)

    # Final pass: force exact target brightness
    if not stop_anim.is_set():
        vis_data = {}
        for step in steps_order:
            publish_step(step, max_b)
            vis_data[step] = max_b
        socketio.emit('vis_update', vis_data)

        if max_b > 0:
            current_state = "ON"
        else:
            current_state = "IDLE"
        socketio.emit('state_update', {'state': current_state})
    else:
        current_state = "IDLE"
        socketio.emit('state_update', {'state': current_state})

def animation_thread_fn(anim_type):
    """
    Entry point for the animation background thread.
    anim_type: 'UP', 'DOWN', 'OFF_UP', 'OFF_DOWN'
    """
    global auto_off_timer

    max_b = settings["maxBrightness"]
    steps_up = list(range(1, TOTAL_STEPS + 1))
    steps_down = list(range(TOTAL_STEPS, 0, -1))

    if anim_type == "UP":
        run_animation(steps_up, max_b, "UP")
        if not stop_anim.is_set():
            schedule_auto_off("UP")
    elif anim_type == "DOWN":
        run_animation(steps_down, max_b, "DOWN")
        if not stop_anim.is_set():
            schedule_auto_off("DOWN")
    elif anim_type == "OFF_UP":
        run_animation(steps_up, 0, "OFF_UP")
    elif anim_type == "OFF_DOWN":
        run_animation(steps_down, 0, "OFF_DOWN")

def schedule_auto_off(direction):
    """After the ON animation finishes, schedule an auto-off."""
    global auto_off_timer
    if auto_off_timer:
        auto_off_timer.cancel()

    def auto_off():
        start_animation(f"OFF_{direction}")

    auto_off_timer = threading.Timer(settings["autoOffTimeout"], auto_off)
    auto_off_timer.start()

def start_animation(anim_type):
    """Start a new animation, cancelling any running one first."""
    global anim_thread, auto_off_timer

    # Cancel running animation
    stop_anim.set()
    if auto_off_timer:
        auto_off_timer.cancel()
        auto_off_timer = None

    # Wait for old thread to finish
    if anim_thread and anim_thread.is_alive():
        anim_thread.join(timeout=2.0)

    stop_anim.clear()
    anim_thread = threading.Thread(target=animation_thread_fn, args=(anim_type,), daemon=True)
    anim_thread.start()

def emergency_off():
    """Immediately stop everything and set all to 0."""
    global current_state, auto_off_timer

    stop_anim.set()
    if auto_off_timer:
        auto_off_timer.cancel()
        auto_off_timer = None

    if anim_thread and anim_thread.is_alive():
        anim_thread.join(timeout=2.0)

    publish_all_off()

    vis_data = {}
    for s in range(1, TOTAL_STEPS + 1):
        vis_data[s] = 0
    socketio.emit('vis_update', vis_data)

    current_state = "IDLE"
    socketio.emit('state_update', {'state': current_state})

# ==================== FLASK ROUTES & WEBSOCKETS ====================
@app.route('/')
def index():
    return render_template('index.html', total_steps=TOTAL_STEPS)

@socketio.on('connect')
def on_ws_connect():
    socketio.emit('sys_status', {'mqtt': mqtt_connected})
    socketio.emit('state_update', {'state': current_state})
    socketio.emit('settings_sync', settings)

@socketio.on('trigger')
def on_trigger(data):
    cmd = data.get('cmd', '')
    if cmd == 'UP':
        start_animation('UP')
    elif cmd == 'DOWN':
        start_animation('DOWN')
    elif cmd == 'OFF_UP':
        start_animation('OFF_UP')
    elif cmd == 'OFF_DOWN':
        start_animation('OFF_DOWN')
    elif cmd == 'EMERGENCY_OFF':
        emergency_off()

@socketio.on('update_settings')
def on_settings(data):
    settings.update(data)
    socketio.emit('settings_sync', settings)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, use_reloader=False, allow_unsafe_werkzeug=True)
