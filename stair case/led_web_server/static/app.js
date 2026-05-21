const socket = io();
let debounceTimer = null;

// ==================== SYSTEM STATUS ====================
socket.on('sys_status', data => {
    const el = document.getElementById('mqttBadge');
    if (data.mqtt) {
        el.className = 'badge badge-ok';
        el.innerText = 'MQTT CONNECTED';
    } else {
        el.className = 'badge badge-err';
        el.innerText = 'MQTT DISCONNECTED';
    }
});

socket.on('state_update', data => {
    const el = document.getElementById('stateBadge');
    const s = data.state;
    el.innerText = s;
    if (s === 'IDLE') {
        el.className = 'badge badge-idle';
    } else if (s === 'ON') {
        el.className = 'badge badge-ok';
    } else {
        el.className = 'badge badge-anim';
    }
});

// ==================== VISUALIZER ====================
socket.on('vis_update', data => {
    for (const [step, brightness] of Object.entries(data)) {
        const bar = document.getElementById(`bar_${step}`);
        const pct = document.getElementById(`pct_${step}`);
        if (!bar) continue;

        const percent = brightness / 255;
        const w = Math.max(1, percent * 100);

        bar.style.width = `${w}%`;
        bar.style.background = `rgba(0, 255, 204, ${Math.max(0.08, percent)})`;
        bar.style.boxShadow = percent > 0.1
            ? `0 0 ${percent * 12}px rgba(0, 255, 204, ${percent * 0.5})`
            : 'none';

        if (pct) pct.innerText = `${Math.round(percent * 100)}%`;
    }
});

// ==================== MQTT LOG ====================
socket.on('mqtt_log', data => {
    const box = document.getElementById('logBox');
    const cls = data.status === 'ok' ? 'log-ok' : (data.status === 'fail' ? 'log-fail' : 'log-queue');
    const ch = data.payload ? `ch${data.payload.channel}=${data.payload.brightness}` : '';
    box.innerHTML += `<div class="${cls}">[${data.t}] ${data.status.toUpperCase()} ${data.topic.split('/').slice(2).join('/')} ${ch}</div>`;
    // Keep log from growing too large
    if (box.children.length > 200) {
        box.removeChild(box.firstChild);
    }
    box.scrollTop = box.scrollHeight;
});

// ==================== SETTINGS SYNC ====================
socket.on('settings_sync', data => {
    for (const [k, v] of Object.entries(data)) {
        const el = document.getElementById(`s_${k}`);
        if (el && document.activeElement !== el) {
            el.value = v;
            const span = document.getElementById(`v_${k}`);
            if (span) span.innerText = v;
        }
    }
});

// ==================== ACTIONS ====================
function trigger(cmd) {
    socket.emit('trigger', { cmd: cmd });
}

function onSlider(el) {
    const span = document.getElementById(`v_${el.dataset.key}`);
    if (span) span.innerText = el.value;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const s = {};
        document.querySelectorAll('.setting-slider').forEach(inp => {
            const val = inp.step && inp.step.includes('.') ? parseFloat(inp.value) : parseInt(inp.value);
            s[inp.dataset.key] = val;
        });
        socket.emit('update_settings', s);
    }, 120);
}
