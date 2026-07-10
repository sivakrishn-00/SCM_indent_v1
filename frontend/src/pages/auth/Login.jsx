import React, { useState } from 'react';
import { ShieldAlert, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import './Login.css';
import api from '../../services/api';

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // First-time login onboarding flow states
  const [loginStep, setLoginStep] = useState('LOGIN_FORM'); // 'LOGIN_FORM', 'EMAIL_PROMPT', 'OTP_PROMPT'
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);

    api.auth.login(username, password)
      .then((data) => {
        setLoading(false);
        
        if (data.first_login_required) {
          setLoginStep('EMAIL_PROMPT');
          return;
        }

        sessionStorage.setItem('token', data.access_token);
        sessionStorage.setItem('user', JSON.stringify(data.user));
        
        api.audit.createLog('LOGIN', 'Auth', `User ${data.user.username} logged in successfully`, 'SUCCESS', 'Global')
          .catch((err) => console.error("Failed to log login action:", err));
        
        if (onLoginSuccess) {
          onLoginSuccess(data.user);
        }
      })
      .catch((err) => {
        setLoading(false);
        setError(err.message || 'Connection failed. Is the backend server running?');
      });
  };

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);

    api.auth.sendOtp(username, email)
      .then((data) => {
        setLoading(false);
        setLoginStep('OTP_PROMPT');
        if (data.dev_otp) {
          setOtp(data.dev_otp);
        }
      })
      .catch((err) => {
        setLoading(false);
        setError(err.message || 'Failed to send OTP. Please verify your email.');
      });
  };

  const handleOtpSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!otp) {
      setError('Please enter the OTP code.');
      return;
    }

    setLoading(true);

    api.auth.verifyOtp(username, email, otp)
      .then((data) => {
        setLoading(false);
        sessionStorage.setItem('token', data.access_token);
        sessionStorage.setItem('user', JSON.stringify(data.user));
        
        api.audit.createLog('LOGIN', 'Auth', `User ${data.user.username} logged in successfully (first-time verified)`, 'SUCCESS', 'Global')
          .catch((err) => console.error("Failed to log login action:", err));
        
        if (onLoginSuccess) {
          onLoginSuccess(data.user);
        }
      })
      .catch((err) => {
        setLoading(false);
        setError(err.message || 'OTP verification failed.');
      });
  };

  return (
    <div className="login-page-wrapper">
      {/* Background patterns for texture overlay */}
      <div className="bg-texture-purple"></div>

      <div className="login-card-container">
        {/* LEFT PANEL: BAVYA Sunset Gradient Water Flow Wave Panel */}
        <div className="login-visual-panel">
          <svg className="wave-svg" viewBox="0 0 100 100" preserveAspectRatio="none" version="1.1" xmlns="http://www.w3.org/2000/svg">
            {/* Base Background (faint golden cream - visible on rightmost wave peak edge) */}
            <rect x="0" y="0" width="100" height="100" fill="#fff9eb" />
            
            {/* Wave Layer 1 (Yellow-Gold) */}
            <path d="M0,0 L 82,0 C 82,8 58,18 58,28 C 58,38 88,48 88,58 C 88,68 63,78 63,88 C 63,94 78,97 78,100 L 0,100 Z" fill="#fbb03b" />
            
            {/* Wave Layer 2 (Warm Orange) */}
            <path d="M0,0 L 71,0 C 71,8 50,18 50,28 C 50,38 77,48 77,58 C 77,68 55,78 55,88 C 55,94 68,97 68,100 L 0,100 Z" fill="#f7931e" />
            
            {/* Wave Layer 3 (Red-Orange) */}
            <path d="M0,0 L 61,0 C 61,8 42,18 42,28 C 42,38 67,48 67,58 C 67,68 47,78 47,88 C 47,94 58,97 58,100 L 0,100 Z" fill="#e34825" />
            
            {/* Wave Layer 4 (Magenta-Pink) */}
            <path d="M0,0 L 51,0 C 51,8 34,18 34,28 C 34,38 57,48 57,58 C 57,68 39,78 39,88 C 39,94 48,97 48,100 L 0,100 Z" fill="#d81159" />
            
            {/* Wave Layer 5 (BAVYA Purple/Indigo Base on far left) */}
            <path d="M0,0 L 41,0 C 41,8 26,18 26,28 C 26,38 47,48 47,58 C 47,68 30,78 30,88 C 30,94 38,97 38,100 L 0,100 Z" fill="#4d1375" />
          </svg>
        </div>

        {/* RIGHT PANEL: Form Panel */}
        <div className="login-form-panel">
          {/* Decorative Scattered Circles in BAVYA Colors */}
          <div className="scattered-circle dot-1 gold"></div>
          <div className="scattered-circle dot-2 purple"></div>
          <div className="scattered-circle dot-3 pink"></div>
          <div className="scattered-circle dot-4 orange"></div>
          <div className="scattered-circle dot-5 gold"></div>
          <div className="scattered-circle dot-6 purple"></div>
          <div className="scattered-circle dot-7 pink"></div>
          <div className="scattered-circle dot-8 orange"></div>
          <div className="scattered-circle dot-9 purple"></div>

          <div className="form-content-wrapper">
            {loginStep === 'LOGIN_FORM' && (
              <>
                <div className="form-header">
                  {/* BAVYA Custom CSS Brand Logo */}
                  <div className="bavya-brand-logo-container">
                    <div className="bavya-brand-logo">
                      <div className="petal petal-tl"></div>
                      <div className="petal petal-tr"></div>
                      <div className="petal petal-bl"></div>
                      <div className="petal petal-br"></div>
                    </div>
                    <span className="bavya-brand-title">BIT-Indent</span>
                  </div>
                  
                  <h2>Log in</h2>
                  <div className="title-underline"></div>
                </div>

                {error && (
                  <div className="error-banner">
                    <ShieldAlert size={18} />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  {/* Username Field with Floating Label */}
                  <div className="input-group floating-label-group">
                    <input
                      type="text"
                      id="username-field"
                      className="form-input"
                      placeholder=" "
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={loading}
                      required
                    />
                    <label htmlFor="username-field" className="floating-label">user name</label>
                  </div>

                  {/* Password Field with Floating Label */}
                  <div className="input-group password-group floating-label-group">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id="password-field"
                      className="form-input"
                      placeholder=" "
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      required
                    />
                    <label htmlFor="password-field" className="floating-label">password</label>
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={loading}
                      tabIndex="-1"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  {/* Forgot Password Link */}
                  <div className="forgot-password-container">
                    <a href="#forgot" className="forgot-password-link">
                      Forgot your <strong>password?</strong>
                    </a>
                  </div>

                  {/* Submit Button */}
                  <div className="submit-btn-container">
                    <button type="submit" className="submit-button" disabled={loading}>
                      {loading ? (
                        <div className="btn-spinner-container">
                          <div className="btn-spinner"></div>
                          <span>Logging in...</span>
                        </div>
                      ) : (
                        <span>Log in</span>
                      )}
                    </button>
                  </div>
                </form>

                {/* Sign Up Link */}
                <div className="signup-prompt-container">
                  <span>Don't have any account? </span>
                  <a href="#signup" className="signup-link">Sign Up</a>
                </div>
              </>
            )}

            {loginStep === 'EMAIL_PROMPT' && (
              <>
                <div className="form-header">
                  <div className="bavya-brand-logo-container">
                    <div className="bavya-brand-logo">
                      <div className="petal petal-tl"></div>
                      <div className="petal petal-tr"></div>
                      <div className="petal petal-bl"></div>
                      <div className="petal petal-br"></div>
                    </div>
                  </div>
                  <h2>Verification</h2>
                  <div className="title-underline"></div>
                  <p className="step-description">
                    Please enter your registered email address to receive a verification OTP.
                  </p>
                </div>

                {error && (
                  <div className="error-banner">
                    <ShieldAlert size={18} />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleEmailSubmit}>
                  {/* Email Field with Floating Label */}
                  <div className="input-group floating-label-group">
                    <input
                      type="email"
                      id="email-field"
                      className="form-input"
                      placeholder=" "
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      required
                    />
                    <label htmlFor="email-field" className="floating-label">registered email</label>
                  </div>

                  {/* Submit Button */}
                  <div className="submit-btn-container">
                    <button type="submit" className="submit-button" disabled={loading}>
                      {loading ? (
                        <div className="btn-spinner-container">
                          <div className="btn-spinner"></div>
                          <span>Sending OTP...</span>
                        </div>
                      ) : (
                        <span>Send OTP</span>
                      )}
                    </button>
                  </div>

                  <button 
                    type="button" 
                    className="back-btn"
                    onClick={() => { setLoginStep('LOGIN_FORM'); setError(''); }}
                    disabled={loading}
                  >
                    <ArrowLeft size={16} />
                    <span>Back to Sign In</span>
                  </button>
                </form>
              </>
            )}

            {loginStep === 'OTP_PROMPT' && (
              <>
                <div className="form-header">
                  <div className="bavya-brand-logo-container">
                    <div className="bavya-brand-logo">
                      <div className="petal petal-tl"></div>
                      <div className="petal petal-tr"></div>
                      <div className="petal petal-bl"></div>
                      <div className="petal petal-br"></div>
                    </div>
                  </div>
                  <h2>Enter OTP</h2>
                  <div className="title-underline"></div>
                  <p className="step-description">
                    We've sent a 6-digit OTP code to <strong>{email}</strong>.
                  </p>
                  {otp && (
                    <div className="dev-otp-autofill">
                      <strong>Dev Mode:</strong> OTP autofilled. Bypass using <strong>000000</strong>.
                    </div>
                  )}
                </div>

                {error && (
                  <div className="error-banner">
                    <ShieldAlert size={18} />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleOtpSubmit}>
                  {/* OTP Field with Floating Label */}
                  <div className="input-group floating-label-group">
                    <input
                      type="text"
                      id="otp-field"
                      maxLength={6}
                      className="form-input otp-input"
                      placeholder=" "
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      disabled={loading}
                      required
                    />
                    <label htmlFor="otp-field" className="floating-label">6-digit OTP</label>
                  </div>

                  {/* Submit Button */}
                  <div className="submit-btn-container">
                    <button type="submit" className="submit-button" disabled={loading}>
                      {loading ? (
                        <div className="btn-spinner-container">
                          <div className="btn-spinner"></div>
                          <span>Verifying...</span>
                        </div>
                      ) : (
                        <span>Verify & Sign In</span>
                      )}
                    </button>
                  </div>

                  <button 
                    type="button" 
                    className="back-btn"
                    onClick={() => { setLoginStep('EMAIL_PROMPT'); setError(''); setOtp(''); }}
                    disabled={loading}
                  >
                    <ArrowLeft size={16} />
                    <span>Back to Email</span>
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
