import React, { useState, useEffect } from 'react';
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
  const [loginStep, setLoginStep] = useState('LOGIN_FORM'); // 'LOGIN_FORM', 'EMAIL_PROMPT', 'OTP_PROMPT', 'FORGOT_EMAIL_PROMPT', 'FORGOT_OTP_PROMPT'
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleResendOtp = () => {
    setError('');
    setSuccessMessage('');
    setLoading(true);
    api.auth.sendOtp(username, email)
      .then(() => {
        setLoading(false);
        setSuccessMessage('A new OTP has been sent successfully.');
        setResendCooldown(30);
      })
      .catch((err) => {
        setLoading(false);
        setError(err.message || 'Failed to resend OTP. Please try again.');
      });
  };

  const handleForgotResendOtp = () => {
    setError('');
    setSuccessMessage('');
    setLoading(true);
    api.auth.forgotPasswordSendOtp(username, email)
      .then(() => {
        setLoading(false);
        setSuccessMessage('A new reset OTP has been sent successfully.');
        setResendCooldown(30);
      })
      .catch((err) => {
        setLoading(false);
        setError(err.message || 'Failed to resend OTP. Please try again.');
      });
  };

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#forgot') {
        setError('');
        setSuccessMessage('');
        setLoginStep('FORGOT_EMAIL_PROMPT');
      } else if (window.location.hash === '#login' || !window.location.hash) {
        setError('');
        setSuccessMessage('');
        setLoginStep('LOGIN_FORM');
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleForgotEmailSubmit = (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!username || !email) {
      setError('Please fill in both username and email.');
      return;
    }

    setLoading(true);

    api.auth.forgotPasswordSendOtp(username, email)
      .then((data) => {
        setLoading(false);
        setLoginStep('FORGOT_OTP_PROMPT');
      })
      .catch((err) => {
        setLoading(false);
        setError(err.message || 'Failed to send reset code. Please check username and email.');
      });
  };

  const handleForgotOtpSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!otp) {
      setError('Please enter the OTP reset code.');
      return;
    }
    if (!newPassword) {
      setError('Please enter a new password.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    api.auth.forgotPasswordVerifyReset(username, email, otp, newPassword)
      .then((data) => {
        setLoading(false);
        setSuccessMessage('Password reset successfully. Please log in with your new password.');
        setPassword('');
        setOtp('');
        setNewPassword('');
        setConfirmPassword('');
        setLoginStep('LOGIN_FORM');
      })
      .catch((err) => {
        setLoading(false);
        setError(err.message || 'Password reset failed. Please check the OTP.');
      });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

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
    if (!newPassword) {
      setError('Please enter a new password.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    api.auth.verifyOtp(username, email, otp, newPassword)
      .then((data) => {
        setLoading(false);
        sessionStorage.setItem('token', data.access_token);
        sessionStorage.setItem('user', JSON.stringify(data.user));
        
        api.audit.createLog('LOGIN', 'Auth', `User ${data.user.username} logged in successfully (first-time verified and password set)`, 'SUCCESS', 'Global')
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
                    <span className="bavya-brand-title">BIT-IndCon</span>
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

                {successMessage && (
                  <div className="success-banner">
                    <span>{successMessage}</span>
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
                    <a 
                      href="#forgot" 
                      className="forgot-password-link"
                      onClick={() => { setError(''); setSuccessMessage(''); }}
                      style={{ textDecoration: 'none' }}
                    >
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
                </div>

                {successMessage && (
                  <div className="success-banner">
                    <span>{successMessage}</span>
                  </div>
                )}

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

                  {/* New Password Field with Floating Label */}
                  <div className="input-group password-group floating-label-group">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      id="new-password-field"
                      className="form-input"
                      placeholder=" "
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={loading}
                      required
                    />
                    <label htmlFor="new-password-field" className="floating-label">new password</label>
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      disabled={loading}
                      tabIndex="-1"
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  {/* Confirm Password Field with Floating Label */}
                  <div className="input-group floating-label-group">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      id="confirm-password-field"
                      className="form-input"
                      placeholder=" "
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      required
                    />
                    <label htmlFor="confirm-password-field" className="floating-label">confirm password</label>
                  </div>

                  {/* Resend OTP Link */}
                  <div className="resend-otp-container">
                    <span>Didn't receive code?</span>
                    <button
                      type="button"
                      className="resend-otp-link-btn"
                      onClick={handleResendOtp}
                      disabled={loading || resendCooldown > 0}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                    </button>
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
                    onClick={() => { setLoginStep('EMAIL_PROMPT'); setError(''); setSuccessMessage(''); setOtp(''); setNewPassword(''); setConfirmPassword(''); }}
                    disabled={loading}
                  >
                    <ArrowLeft size={16} />
                    <span>Back to Email</span>
                  </button>
                </form>
              </>
            )}

            {loginStep === 'FORGOT_EMAIL_PROMPT' && (
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
                  <h2>Reset Password</h2>
                  <div className="title-underline"></div>
                  <p className="step-description">
                    Enter your username and registered email address to receive a password reset OTP.
                  </p>
                </div>

                {error && (
                  <div className="error-banner">
                    <ShieldAlert size={18} />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleForgotEmailSubmit}>
                  {/* Username Field with Floating Label */}
                  <div className="input-group floating-label-group">
                    <input
                      type="text"
                      id="forgot-username-field"
                      className="form-input"
                      placeholder=" "
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={loading}
                      required
                    />
                    <label htmlFor="forgot-username-field" className="floating-label">user name</label>
                  </div>

                  {/* Email Field with Floating Label */}
                  <div className="input-group floating-label-group">
                    <input
                      type="email"
                      id="forgot-email-field"
                      className="form-input"
                      placeholder=" "
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      required
                    />
                    <label htmlFor="forgot-email-field" className="floating-label">registered email</label>
                  </div>

                  {/* Submit Button */}
                  <div className="submit-btn-container">
                    <button type="submit" className="submit-button" disabled={loading}>
                      {loading ? (
                        <div className="btn-spinner-container">
                          <div className="btn-spinner"></div>
                          <span>Sending...</span>
                        </div>
                      ) : (
                        <span>Send Reset OTP</span>
                      )}
                    </button>
                  </div>

                  <button 
                    type="button" 
                    className="back-btn"
                    onClick={() => { 
                      window.location.hash = ''; 
                      setError(''); 
                      setEmail(''); 
                    }}
                    disabled={loading}
                  >
                    <ArrowLeft size={16} />
                    <span>Back to Sign In</span>
                  </button>
                </form>
              </>
            )}

            {loginStep === 'FORGOT_OTP_PROMPT' && (
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
                  <h2>Reset Password</h2>
                  <div className="title-underline"></div>
                  <p className="step-description">
                    We've sent a 6-digit reset code to <strong>{email}</strong>.
                  </p>
                </div>

                {successMessage && (
                  <div className="success-banner">
                    <span>{successMessage}</span>
                  </div>
                )}

                {error && (
                  <div className="error-banner">
                    <ShieldAlert size={18} />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleForgotOtpSubmit}>
                  {/* OTP Field with Floating Label */}
                  <div className="input-group floating-label-group">
                    <input
                      type="text"
                      id="forgot-otp-field"
                      maxLength={6}
                      className="form-input otp-input"
                      placeholder=" "
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      disabled={loading}
                      required
                    />
                    <label htmlFor="forgot-otp-field" className="floating-label">6-digit OTP</label>
                  </div>

                  {/* New Password Field with Floating Label */}
                  <div className="input-group password-group floating-label-group">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      id="forgot-new-password-field"
                      className="form-input"
                      placeholder=" "
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={loading}
                      required
                    />
                    <label htmlFor="forgot-new-password-field" className="floating-label">new password</label>
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      disabled={loading}
                      tabIndex="-1"
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  {/* Confirm Password Field with Floating Label */}
                  <div className="input-group floating-label-group">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      id="forgot-confirm-password-field"
                      className="form-input"
                      placeholder=" "
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      required
                    />
                    <label htmlFor="forgot-confirm-password-field" className="floating-label">confirm password</label>
                  </div>

                  {/* Resend OTP Link */}
                  <div className="resend-otp-container">
                    <span>Didn't receive code?</span>
                    <button
                      type="button"
                      className="resend-otp-link-btn"
                      onClick={handleForgotResendOtp}
                      disabled={loading || resendCooldown > 0}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                    </button>
                  </div>

                  {/* Submit Button */}
                  <div className="submit-btn-container">
                    <button type="submit" className="submit-button" disabled={loading}>
                      {loading ? (
                        <div className="btn-spinner-container">
                          <div className="btn-spinner"></div>
                          <span>Resetting...</span>
                        </div>
                      ) : (
                        <span>Verify & Reset</span>
                      )}
                    </button>
                  </div>

                  <button 
                    type="button" 
                    className="back-btn"
                    onClick={() => { setLoginStep('FORGOT_EMAIL_PROMPT'); setError(''); setSuccessMessage(''); setOtp(''); setNewPassword(''); setConfirmPassword(''); }}
                    disabled={loading}
                  >
                    <ArrowLeft size={16} />
                    <span>Back</span>
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
