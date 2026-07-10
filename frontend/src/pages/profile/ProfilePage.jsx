import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Phone, MapPin, Briefcase, Shield, ArrowLeft, Network, Activity } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import api from '../../services/api';
import './ProfilePage.css';

export default function ProfilePage() {
  const { user, userRole } = useApp();
  const navigate = useNavigate();
  
  const [hierarchyData, setHierarchyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.users.getMeHierarchy()
      .then((data) => {
        setHierarchyData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load user hierarchy:", err);
        setError(err.message || 'Failed to fetch reporting hierarchy.');
        setLoading(false);
      });
  }, []);

  return (
    <div className="profile-container">
      {/* Back button */}
      <div className="profile-header-actions">
        <button className="profile-back-btn" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={16} />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Main card grid */}
      <div className="profile-grid">
        {/* Left card - Primary Info */}
        <div className="profile-card main-info-card">
          <div className="profile-banner">
            <div className="bavya-brand-logo" style={{ transform: 'scale(1.2)', margin: '0 auto' }}>
              <div className="petal petal-tl"></div>
              <div className="petal petal-tr"></div>
              <div className="petal petal-bl"></div>
              <div className="petal petal-br"></div>
            </div>
          </div>
          
          <div className="profile-avatar-wrapper">
            <div className="profile-avatar">
              <User size={36} />
            </div>
            <h2>{hierarchyData?.logged_in_name || user?.username || 'Employee'}</h2>
            <span className="profile-role-badge">{userRole?.toUpperCase() || 'USER'}</span>
          </div>

          <div className="profile-details-list">
            <div className="details-item">
              <Shield size={18} className="details-icon" />
              <div className="details-text">
                <span className="details-label">Security Role</span>
                <span className="details-value">{user?.role || 'Operator'}</span>
              </div>
            </div>

            <div className="details-item">
              <Mail size={18} className="details-icon" />
              <div className="details-text">
                <span className="details-label">Email Address</span>
                <span className="details-value">{hierarchyData?.email || user?.email || 'N/A'}</span>
              </div>
            </div>

            <div className="details-item">
              <Phone size={18} className="details-icon" />
              <div className="details-text">
                <span className="details-label">Phone Number</span>
                <span className="details-value">{hierarchyData?.phone || 'N/A'}</span>
              </div>
            </div>

            <div className="details-item">
              <Briefcase size={18} className="details-icon" />
              <div className="details-text">
                <span className="details-label">Assigned Project</span>
                <span className="details-value">{user?.project || hierarchyData?.project || 'Global'}</span>
              </div>
            </div>

            <div className="details-item">
              <MapPin size={18} className="details-icon" />
              <div className="details-text">
                <span className="details-label">Location / Hub</span>
                <span className="details-value">{hierarchyData?.office_name || 'Global HQ'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right card - Hierarchy Chain & System info */}
        <div className="profile-card hierarchy-card">
          <div className="card-header">
            <Network size={20} className="header-icon" />
            <h3 className="section-title">Reporting Hierarchy</h3>
          </div>
          
          {loading ? (
            <div className="profile-loading-wrapper">
              <div className="bavya-spinner" style={{ margin: '0 auto' }}>
                <div className="petal petal-tl"></div>
                <div className="petal petal-tr"></div>
                <div className="petal petal-bl"></div>
                <div className="petal petal-br"></div>
              </div>
              <span className="loading-text">Trace-mapping hierarchy path...</span>
            </div>
          ) : error ? (
            <div className="profile-error-wrapper">
              <p>{error}</p>
            </div>
          ) : (
            <div className="hierarchy-chain-container">
              <p className="hierarchy-info-banner">
                Below details show the active materialized approval path and reporting levels for your project hub <strong>({user?.project || hierarchyData?.project || 'Global'})</strong>.
              </p>
              
              <div className="timeline-container">
                {/* Logged in User Node (Leaf/Base of reporting chain) */}
                <div className="timeline-node current-user-node">
                  <div className="node-marker active">
                    <User size={14} />
                  </div>
                  <div className="node-content">
                    <h4 className="node-name">{hierarchyData?.logged_in_name || 'You'}</h4>
                    <span className="node-role">Your Account ({user?.username})</span>
                    <span className="node-badge leaf">Active Leaf Node</span>
                  </div>
                </div>

                {hierarchyData?.approval_chain_raw && hierarchyData.approval_chain_raw.length > 1 ? (
                  hierarchyData.approval_chain_raw.slice(1).map((mgr, idx) => (
                    <div key={idx} className={`timeline-node manager-node level-${(idx % 4) + 1}`}>
                      <div className="node-marker">
                        <Shield size={14} />
                      </div>
                      <div className="node-content">
                        <h4 className="node-name">{mgr.name || mgr.username}</h4>
                        <span className="node-role">{mgr.role || mgr.role_name || 'Reporting Authority'}</span>
                        {mgr.office_name && <span className="node-location"><MapPin size={11} /> {mgr.office_name}</span>}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="timeline-node end-chain-node">
                    <div className="node-marker final">
                      <Activity size={14} />
                    </div>
                    <div className="node-content">
                      <h4 className="node-name">System Administrator</h4>
                      <span className="node-role">Direct Global Authority</span>
                      <p className="node-desc">You are at the top level or have no reporting hierarchy restriction.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
