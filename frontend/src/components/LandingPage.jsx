import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Zap, Shield, Smartphone } from 'lucide-react';

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="auth-page">
      {/* Navbar */}
      <nav className="auth-nav">
        <div className="auth-logo-group">
          <div className="auth-logo-icon">
            <Home />
          </div>
          <span className="auth-logo-text">
            SmartHome
          </span>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="auth-btn-outline"
        >
          Login
        </button>
      </nav>

      {/* Hero Section */}
      <main className="landing-main">
        <div className="hero-content">
          <h1 className="hero-title">
            Control your home,
            <br />
            <span className="hero-title-highlight">
              effortlessly.
            </span>
          </h1>
          <p className="hero-subtitle">
            Experience the future of living with our intuitive smart home dashboard. 
            Automate tasks, monitor sensors, and set the perfect mood with a tap.
          </p>
          <div className="pt-4 flex items-center justify-center gap-4">
            <button
              onClick={() => navigate('/login')}
              className="hero-btn"
            >
              Get Started <Zap className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="features-grid">
          <FeatureCard 
            icon={<Zap />}
            title="Instant Control"
            desc="Control lights, media, and climate in real-time."
          />
          <FeatureCard 
            icon={<Shield />}
            title="Secure & Private"
            desc="Your data stays locally on your network with secure access."
          />
          <FeatureCard 
            icon={<Smartphone />}
            title="Anywhere Access"
            desc="Responsive design works beautifully on any device."
          />
        </div>
      </main>
    </div>
  );
};

const FeatureCard = ({ icon, title, desc }) => (
  <div className="feature-card">
    <div className="feature-icon-wrapper">
      {icon}
    </div>
    <h3 className="feature-title">{title}</h3>
    <p className="feature-desc">{desc}</p>
  </div>
);

export default LandingPage;
