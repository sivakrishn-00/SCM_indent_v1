import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { 
  Server, Key, ShieldAlert, Cpu, CheckCircle2, 
  RefreshCw, Save, Activity, ToggleLeft, ToggleRight, Plus, X
} from 'lucide-react';
import { api } from '../../services/api';
import './ApiManagementPage.css';

export default function ApiManagementPage() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState(null);
  
  // Creation state
  const [isCreating, setIsCreating] = useState(false);
  const [newConfig, setNewConfig] = useState({
    api_identifier: '',
    display_name: '',
    base_url: '',
    auth_type: 'none',
    auth_data: {},
    is_active: true
  });
  
  // connection test responses
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const data = await api.apiConfigs.getConfigs();
      setConfigs(data);
      if (data.length > 0) {
        setSelectedConfig(data[0]);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load API configurations.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    if (isCreating) {
      setNewConfig(prev => ({
        ...prev,
        [field]: value
      }));
    } else {
      setSelectedConfig(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleAuthDataChange = (key, value) => {
    if (isCreating) {
      setNewConfig(prev => ({
        ...prev,
        auth_data: {
          ...prev.auth_data,
          [key]: value
        }
      }));
    } else {
      setSelectedConfig(prev => ({
        ...prev,
        auth_data: {
          ...prev.auth_data,
          [key]: value
        }
      }));
    }
  };

  const handleAuthTypeChange = (type) => {
    let defaultData = {};
    if (type === 'api_key_header') {
      defaultData = { header_name: 'X-api-key', api_key: '' };
    } else if (type === 'bearer_token') {
      defaultData = { token: '' };
    } else if (type === 'basic_auth') {
      defaultData = { username: '', password: '' };
    }
    
    if (isCreating) {
      setNewConfig(prev => ({
        ...prev,
        auth_type: type,
        auth_data: defaultData
      }));
    } else {
      setSelectedConfig(prev => ({
        ...prev,
        auth_type: type,
        auth_data: defaultData
      }));
    }
  };

  const startCreateMode = () => {
    setIsCreating(true);
    setNewConfig({
      api_identifier: '',
      display_name: '',
      base_url: '',
      auth_type: 'none',
      auth_data: {},
      is_active: true
    });
    setTestResult(null);
  };

  const handleCreate = async () => {
    if (!newConfig.display_name.trim()) {
      toast.error('Display Name cannot be empty.');
      return;
    }
    if (!newConfig.api_identifier.trim()) {
      toast.error('System Identifier cannot be empty.');
      return;
    }
    // Validate system identifier matches format
    const identifierFormat = /^[a-z0-9_]+$/;
    if (!identifierFormat.test(newConfig.api_identifier)) {
      toast.error('Identifier must only contain lowercase letters, numbers, and underscores.');
      return;
    }
    if (!newConfig.base_url.trim()) {
      toast.error('Base URL cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      const created = await api.apiConfigs.createConfig({
        api_identifier: newConfig.api_identifier,
        display_name: newConfig.display_name,
        base_url: newConfig.base_url,
        auth_type: newConfig.auth_type,
        auth_data: newConfig.auth_data,
        is_active: newConfig.is_active
      });
      
      setConfigs(prev => [...prev, created]);
      setSelectedConfig(created);
      setIsCreating(false);
      toast.success('Integration created successfully!');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to create integration.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedConfig.display_name.trim()) {
      toast.error('Display Name cannot be empty.');
      return;
    }
    if (!selectedConfig.base_url.trim()) {
      toast.error('Base URL cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      const updated = await api.apiConfigs.updateConfig(selectedConfig.api_identifier, {
        api_identifier: selectedConfig.api_identifier,
        display_name: selectedConfig.display_name,
        base_url: selectedConfig.base_url,
        auth_type: selectedConfig.auth_type,
        auth_data: selectedConfig.auth_data,
        is_active: selectedConfig.is_active
      });
      
      setConfigs(prev => prev.map(c => c.api_identifier === updated.api_identifier ? updated : c));
      setSelectedConfig(updated);
      toast.success('Configuration saved successfully!');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const activeData = isCreating ? newConfig : selectedConfig;
    try {
      const res = await api.apiConfigs.testConnection({
        base_url: activeData.base_url,
        auth_type: activeData.auth_type,
        auth_data: activeData.auth_data
      });
      setTestResult(res);
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      console.error(err);
      setTestResult({
        success: false,
        status_code: 500,
        message: err.message || 'Connection test failed to dispatch.'
      });
      toast.error('Test query failed.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="api-loading-container">
        <RefreshCw className="spin-icon" size={32} />
        <span>Fetching API settings...</span>
      </div>
    );
  }

  const activeConfig = isCreating ? newConfig : selectedConfig;

  return (
    <div className="api-mgmt-container edge-to-edge">
      <div className="api-mgmt-header">
        <div>
          <h1>API Integration Hub</h1>
          <p className="subtitle">Manage external connections, auth strategies, and environment endpoints dynamically.</p>
        </div>
        <div className="header-badge">
          <Activity size={16} className="pulse-icon" />
          <span>Active Connections: {configs.filter(c => c.is_active).length}</span>
        </div>
      </div>

      <div className="api-mgmt-content">
        {/* Left column - Integration List */}
        <div className="api-list-sidebar">
          <div className="sidebar-title-row">
            <h3>Integrations</h3>
            <button 
              type="button" 
              className="add-integration-btn"
              onClick={startCreateMode}
              disabled={isCreating}
              title="Add New Integration"
            >
              <Plus size={16} />
              <span>Add</span>
            </button>
          </div>
          
          <div className="api-cards-wrapper">
            {configs.map(c => (
              <div 
                key={c.id} 
                className={`api-side-card ${(!isCreating && selectedConfig?.api_identifier === c.api_identifier) ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedConfig(c);
                  setIsCreating(false);
                  setTestResult(null);
                }}
              >
                <div className="card-top">
                  <div className="icon-container">
                    <Server size={18} />
                  </div>
                  <div>
                    <h4>{c.display_name}</h4>
                    <span className="identifier">{c.api_identifier}</span>
                  </div>
                </div>
                <div className="card-bottom">
                  <span className={`status-pill ${c.is_active ? 'active' : 'inactive'}`}>
                    {c.is_active ? 'Active' : 'Disabled'}
                  </span>
                  <span className="auth-pill">{c.auth_type.replace('_', ' ')}</span>
                </div>
              </div>
            ))}
            
            {configs.length === 0 && !isCreating && (
              <div className="empty-sidebar-msg">
                No integrations registered.
              </div>
            )}
          </div>
        </div>

        {/* Right column - Configuration Editor */}
        {activeConfig && (
          <div className="api-editor-panel">
            <div className="editor-header">
              <h2>{isCreating ? 'New Connection Parameters' : 'Connection Parameters'}</h2>
              <div className="toggle-switch" onClick={() => handleInputChange('is_active', !activeConfig.is_active)}>
                {activeConfig.is_active ? (
                  <ToggleRight className="toggle-icon active" size={36} />
                ) : (
                  <ToggleLeft className="toggle-icon inactive" size={36} />
                )}
                <span>{activeConfig.is_active ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>

            <div className="editor-form">
              <div className="form-group row">
                <div className="form-field">
                  <label htmlFor="display_name">Display Name</label>
                  <input 
                    type="text" 
                    id="display_name"
                    value={activeConfig.display_name} 
                    onChange={e => handleInputChange('display_name', e.target.value)}
                    placeholder="e.g. Pharmacy Stock Sync"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="api_identifier">System Identifier</label>
                  <input 
                    type="text" 
                    id="api_identifier" 
                    value={activeConfig.api_identifier} 
                    onChange={e => handleInputChange('api_identifier', e.target.value)}
                    disabled={!isCreating} 
                    className={!isCreating ? 'disabled-input' : ''}
                    placeholder="e.g. pharmacy_stock_api"
                  />
                  {isCreating && <span className="input-tip">Lowercase, digits, and underscores only. Key identifier.</span>}
                </div>
              </div>

              <div className="form-field full-width">
                <label htmlFor="base_url">Target Base URL Endpoint</label>
                <div className="input-with-icon">
                  <Server className="input-field-icon" size={16} />
                  <input 
                    type="url" 
                    id="base_url"
                    value={activeConfig.base_url} 
                    onChange={e => handleInputChange('base_url', e.target.value)}
                    placeholder="https://api.thirdparty.com/v1"
                  />
                </div>
              </div>

              <div className="auth-strategy-section">
                <h3>Authentication Strategy</h3>
                <div className="strategy-grid">
                  {[
                    { id: 'api_key_header', label: 'API Key (Header)' },
                    { id: 'bearer_token', label: 'Bearer Token' },
                    { id: 'basic_auth', label: 'Basic Authentication' },
                    { id: 'none', label: 'No Auth' }
                  ].map(strat => (
                    <div 
                      key={strat.id} 
                      className={`strategy-radio-card ${activeConfig.auth_type === strat.id ? 'active' : ''}`}
                      onClick={() => handleAuthTypeChange(strat.id)}
                    >
                      <div className="radio-marker"></div>
                      <span>{strat.label}</span>
                    </div>
                  ))}
                </div>

                <div className="auth-fields-box">
                  {activeConfig.auth_type === 'api_key_header' && (
                    <div className="form-group row">
                      <div className="form-field">
                        <label htmlFor="header_name">Header Parameter Name</label>
                        <input 
                          type="text" 
                          id="header_name"
                          value={activeConfig.auth_data?.header_name || ''} 
                          onChange={e => handleAuthDataChange('header_name', e.target.value)}
                          placeholder="e.g. X-api-key"
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="api_key">API Key Secret Value</label>
                        <div className="input-with-icon">
                          <Key className="input-field-icon" size={16} />
                          <input 
                            type="password" 
                            id="api_key"
                            value={activeConfig.auth_data?.api_key || ''} 
                            onChange={e => handleAuthDataChange('api_key', e.target.value)}
                            placeholder={isCreating ? "Enter security key value" : "Keep empty or enter new key to edit"}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeConfig.auth_type === 'bearer_token' && (
                    <div className="form-field full-width">
                      <label htmlFor="token">Bearer Token</label>
                      <div className="input-with-icon">
                        <Key className="input-field-icon" size={16} />
                        <input 
                          type="password" 
                          id="token"
                          value={activeConfig.auth_data?.token || ''} 
                          onChange={e => handleAuthDataChange('token', e.target.value)}
                          placeholder={isCreating ? "Bearer security token..." : "Keep empty or enter new token to edit"}
                        />
                      </div>
                    </div>
                  )}

                  {activeConfig.auth_type === 'basic_auth' && (
                    <div className="form-group row">
                      <div className="form-field">
                        <label htmlFor="username">Username</label>
                        <input 
                          type="text" 
                          id="username"
                          value={activeConfig.auth_data?.username || ''} 
                          onChange={e => handleAuthDataChange('username', e.target.value)}
                          placeholder="Username"
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="password">Password</label>
                        <div className="input-with-icon">
                          <Key className="input-field-icon" size={16} />
                          <input 
                            type="password" 
                            id="password"
                            value={activeConfig.auth_data?.password || ''} 
                            onChange={e => handleAuthDataChange('password', e.target.value)}
                            placeholder={isCreating ? "Password" : "Keep empty or enter new password to edit"}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeConfig.auth_type === 'none' && (
                    <div className="no-auth-message">
                      <Cpu size={24} />
                      <p>Open access configuration. Requests will be dispatched without additional authentication headers.</p>
                    </div>
                  )}
                </div>
              </div>

              {testResult && (
                <div className={`connection-alert ${testResult.success ? 'success' : 'error'}`}>
                  {testResult.success ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
                  <div className="alert-content">
                    <strong>Connection Test: {testResult.success ? 'PASSED' : 'FAILED'} (Status: {testResult.status_code})</strong>
                    <p>{testResult.message}</p>
                  </div>
                </div>
              )}

              <div className="action-buttons-container">
                {isCreating && (
                  <button 
                    type="button" 
                    className="cancel-btn" 
                    onClick={() => {
                      setIsCreating(false);
                      setTestResult(null);
                      if (configs.length > 0) {
                        setSelectedConfig(configs[0]);
                      }
                    }}
                  >
                    <X size={16} />
                    <span>Cancel</span>
                  </button>
                )}
                
                <button 
                  type="button" 
                  className="test-btn" 
                  disabled={testing || saving}
                  onClick={handleTestConnection}
                >
                  <RefreshCw className={testing ? 'spin-icon' : ''} size={16} />
                  <span>{testing ? 'Testing Connection...' : 'Test Connection'}</span>
                </button>
                
                <button 
                  type="button" 
                  className="save-btn" 
                  disabled={saving || testing}
                  onClick={isCreating ? handleCreate : handleSave}
                >
                  <Save size={16} />
                  <span>{saving ? 'Creating...' : (isCreating ? 'Create Integration' : 'Save Settings')}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
