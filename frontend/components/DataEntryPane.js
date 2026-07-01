'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { User, UserPlus, HeartPulse, Pill, Home, Plus, Trash2, ChevronDown, ChevronRight, Copy, Check, X, Eye, EyeOff } from 'lucide-react';

const RELATIONSHIP_TYPES = ['Parent-Child', 'Roommate', 'Sibling-Sibling', 'Spouse'];
const CONDITION_TYPES = ['Genetic', 'Autoimmune', 'Chronic', 'Symptom', 'Allergy'];
const MED_STATUSES = ['Active', 'Proposed', 'Discontinued'];

const DataEntryPane = ({ userId, profile, profiles, medicalRecords, relationships, onDataChange }) => {
  const supabase = createClient();
  const [expandedSection, setExpandedSection] = useState('profile');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showInviteCode, setShowInviteCode] = useState(false);

  // ---------- Form states ----------
  const [profileForm, setProfileForm] = useState({
    name: profile?.full_name || '',
    age: profile?.age || ''
  });
  const [connectForm, setConnectForm] = useState({
    receiver_id: '',
    relationship_type: 'Parent-Child'
  });
  const [conditionForm, setConditionForm] = useState({ condition_name: '', condition_type: 'Chronic' });
  const [medForm, setMedForm] = useState({ drug_name: '', status: 'Active' });

  // Update profile form when profile loads
  React.useEffect(() => {
    if (profile) {
      setProfileForm({
        name: profile.full_name || '',
        age: profile.age || ''
      });
    }
  }, [profile]);

  // Derived lists
  const profilesMap = React.useMemo(() => {
    const map = {};
    profiles.forEach(p => { map[p.id] = p; });
    return map;
  }, [profiles]);

  const myRecords = medicalRecords.filter(r => r.user_id === userId);
  const myConditions = myRecords.filter(r => r.record_type === 'condition');
  const myMedications = myRecords.filter(r => r.record_type === 'medication');

  // Parse relationship lists
  const activeRelationships = [];
  const pendingIncoming = [];
  const pendingOutgoing = [];

  relationships.forEach(rel => {
    if (rel.status === 'active') {
      const relUserId = rel.requester_id === userId ? rel.receiver_id : rel.requester_id;
      const relUser = profilesMap[relUserId];
      if (relUser) {
        activeRelationships.push({ rel, user: relUser });
      }
    } else if (rel.status === 'pending') {
      if (rel.receiver_id === userId) {
        const requesterUser = profilesMap[rel.requester_id];
        if (requesterUser) {
          pendingIncoming.push({ rel, user: requesterUser });
        }
      } else if (rel.requester_id === userId) {
        const receiverUser = profilesMap[rel.receiver_id];
        if (receiverUser) {
          pendingOutgoing.push({ rel, user: receiverUser });
        }
      }
    }
  });

  // ---------- Handlers ----------
  const handleCopyInvite = () => {
    navigator.clipboard.writeText(userId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: profileForm.name,
        age: profileForm.age ? parseInt(profileForm.age) : null
      })
      .eq('id', userId);

    if (error) console.error('Failed to update profile:', error);
    setSaving(false);
    onDataChange?.();
  };

  const handleSendRequest = async (e) => {
    e.preventDefault();
    const targetId = connectForm.receiver_id.trim();
    if (!targetId || targetId === userId) return;

    // Prevent duplicate relationships of the SAME type
    const exists = relationships.some(r => 
      ((r.requester_id === userId && r.receiver_id === targetId) || 
      (r.receiver_id === userId && r.requester_id === targetId)) &&
      r.relationship_type === connectForm.relationship_type
    );
    if (exists) {
      alert(`A ${connectForm.relationship_type} connection with this user already exists or is pending.`);
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('relationships')
      .insert({
        requester_id: userId,
        receiver_id: targetId,
        relationship_type: connectForm.relationship_type,
        status: 'pending'
      });

    if (error) {
      console.error('Failed to send relation request:', error);
      alert('Could not send invite. Verify the Invite Code is correct.');
    } else {
      setConnectForm(prev => ({ ...prev, receiver_id: '' }));
    }
    setSaving(false);
    onDataChange?.();
  };

  const handleAcceptRequest = async (relId) => {
    setSaving(true);
    const { error } = await supabase
      .from('relationships')
      .update({ status: 'active' })
      .eq('id', relId);

    if (error) console.error('Failed to accept request:', error);
    setSaving(false);
    onDataChange?.();
  };

  const handleRejectRequest = async (relId) => {
    setSaving(true);
    const { error } = await supabase
      .from('relationships')
      .delete()
      .eq('id', relId);

    if (error) {
      console.error('Failed to delete relationship:', error);
      alert('Failed to delete relationship. Check browser console for details.');
    }
    setSaving(false);
    onDataChange?.();
  };

  const handleAddCondition = async (e) => {
    e.preventDefault();
    if (!conditionForm.condition_name.trim()) return;

    setSaving(true);
    const { error } = await supabase
      .from('medical_records')
      .insert({
        user_id: userId,
        record_type: 'condition',
        name: conditionForm.condition_name.trim(),
        metadata: { condition_type: conditionForm.condition_type }
      });

    if (error) console.error('Failed to add condition:', error);
    setConditionForm({ condition_name: '', condition_type: 'Chronic' });
    setSaving(false);
    onDataChange?.();
  };

  const handleAddMedication = async (e) => {
    e.preventDefault();
    if (!medForm.drug_name.trim()) return;

    setSaving(true);
    const { error } = await supabase
      .from('medical_records')
      .insert({
        user_id: userId,
        record_type: 'medication',
        name: medForm.drug_name.trim(),
        metadata: { status: medForm.status }
      });

    if (error) console.error('Failed to add medication:', error);
    setMedForm({ drug_name: '', status: 'Active' });
    setSaving(false);
    onDataChange?.();
  };

  const handleDeleteRecord = async (recordId) => {
    setSaving(true);
    const { error } = await supabase
      .from('medical_records')
      .delete()
      .eq('id', recordId);

    if (error) console.error('Failed to delete medical record:', error);
    setSaving(false);
    onDataChange?.();
  };

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const SectionHeader = ({ id, icon: Icon, title, count, color }) => (
    <button className="de-section-header" onClick={() => toggleSection(id)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon size={18} style={{ color }} />
        <span>{title}</span>
        {count !== undefined && <span className="de-count">{count}</span>}
      </div>
      {expandedSection === id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
    </button>
  );

  return (
    <div className="data-entry-pane">
      {/* Header */}
      <div className="de-header">
        <h2 className="de-title" style={{ width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span style={{ fontSize: '20px', fontWeight: 'bold' }}>{profile?.full_name || 'My Profile'}</span>
              {profile?.age != null && (
                <div style={{ backgroundColor: 'var(--bg-lighter)', padding: '4px 10px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Age</span>
                  <span style={{ fontSize: '15px', color: 'var(--accent-cyan)', fontWeight: 'bold' }}>{profile.age}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 500, fontFamily: 'monospace', opacity: 0.8 }}>
                Code: {showInviteCode ? userId : '••••••••-••••-••••-••••-••••••••••••'}
              </span>
              <button onClick={() => setShowInviteCode(v => !v)} className="de-remove-btn" title={showInviteCode ? 'Hide Invite Code' : 'Show Invite Code'}>
                {showInviteCode ? <EyeOff size={11} /> : <Eye size={11} />}
              </button>
              <button onClick={handleCopyInvite} className="de-remove-btn" title="Copy Invite Code">
                {copied ? <Check size={11} style={{ color: '#34d399' }} /> : <Copy size={11} />}
              </button>
            </div>
          </div>
        </h2>
      </div>

      <div className="de-sections">
        {/* ---- My Profile Info Section ---- */}
        <div className="de-section">
          <SectionHeader id="profile" icon={User} title="My Identity details" color="#60a5fa" />
          {expandedSection === 'profile' && (
            <div className="de-section-body">
              <form onSubmit={handleUpdateProfile} className="de-form-row">
                <input
                  placeholder="Full Name"
                  value={profileForm.name}
                  onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))}
                  className="de-input"
                  required
                  disabled={saving}
                />
                <input
                  placeholder="Age"
                  type="number"
                  min="0"
                  value={profileForm.age}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === '' || parseInt(val) >= 0) {
                      setProfileForm(p => ({ ...p, age: val }));
                    }
                  }}
                  className="de-input de-input-small"
                  disabled={saving}
                />
                <button type="submit" className="de-add-btn" disabled={saving}>
                  Save
                </button>
              </form>
            </div>
          )}
        </div>

        {/* ---- Connections Section ---- */}
        <div className="de-section">
          <SectionHeader id="connections" icon={UserPlus} title="Family & Connections" count={activeRelationships.length + pendingIncoming.length + pendingOutgoing.length} color="#fbbf24" />
          {expandedSection === 'connections' && (
            <div className="de-section-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Send request form */}
              <form onSubmit={handleSendRequest} className="de-form-row" style={{ flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>CONNECT RELATIVE / ROOMMATE:</span>
                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                  <input
                    placeholder="Paste their Invite Code here..."
                    value={connectForm.receiver_id}
                    onChange={e => setConnectForm(p => ({ ...p, receiver_id: e.target.value }))}
                    className="de-input"
                    required
                    disabled={saving}
                  />
                  <select
                    value={connectForm.relationship_type}
                    onChange={e => setConnectForm(p => ({ ...p, relationship_type: e.target.value }))}
                    className="de-select"
                    disabled={saving}
                  >
                    {RELATIONSHIP_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button type="submit" className="de-add-btn" disabled={saving}>
                    <Plus size={14} />
                  </button>
                </div>
              </form>

              {/* Pending Incoming Requests */}
              {pendingIncoming.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 600 }}>INCOMING REQUESTS:</span>
                  <div className="de-list">
                    {pendingIncoming.map(({ rel, user }) => (
                      <div key={rel.id} className="de-list-item">
                        <div>
                          <span className="de-item-name">{user.full_name}</span>
                          <span className="de-item-badge" style={{ borderColor: '#fbbf24', color: '#fbbf24' }}>{rel.relationship_type}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="de-remove-btn" onClick={() => handleAcceptRequest(rel.id)} title="Accept connection request">
                            <Check size={14} style={{ color: '#34d399' }} />
                          </button>
                          <button className="de-remove-btn" onClick={() => handleRejectRequest(rel.id)} title="Decline request">
                            <X size={14} style={{ color: '#fb7185' }} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Outgoing Requests */}
              {pendingOutgoing.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>SENT REQUESTS (PENDING):</span>
                  <div className="de-list">
                    {pendingOutgoing.map(({ rel, user }) => (
                      <div key={rel.id} className="de-list-item">
                        <div>
                          <span className="de-item-name">{user.full_name}</span>
                          <span className="de-item-badge" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>{rel.relationship_type}</span>
                        </div>
                        <button className="de-remove-btn" onClick={() => handleRejectRequest(rel.id)} title="Cancel request">
                          <X size={14} style={{ color: '#6b7280' }} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Connections */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 600 }}>ACTIVE CONNECTIONS:</span>
                <div className="de-list">
                  {activeRelationships.map(({ rel, user }) => (
                    <div key={rel.id} className="de-list-item">
                      <div>
                        <span className="de-item-name">{user.full_name}</span>
                        <span className="de-item-badge" style={{ borderColor: '#34d399', color: '#34d399' }}>{rel.relationship_type}</span>
                        {user.age && <span className="de-item-meta">Age {user.age}</span>}
                      </div>
                      <button className="de-remove-btn" onClick={() => handleRejectRequest(rel.id)} title="Disconnect link">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {activeRelationships.length === 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>
                      No active familial links. Invite relatives to see combined safety correlations.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ---- Conditions Section ---- */}
        <div className="de-section">
          <SectionHeader id="conditions" icon={HeartPulse} title="My Health Conditions" count={myConditions.length} color="#fb7185" />
          {expandedSection === 'conditions' && (
            <div className="de-section-body">
              <form onSubmit={handleAddCondition} className="de-form-row">
                <input
                  placeholder="e.g. Asthma, CYP2D6 Deficiency"
                  value={conditionForm.condition_name}
                  onChange={e => setConditionForm(c => ({ ...c, condition_name: e.target.value }))}
                  className="de-input"
                  required
                  disabled={saving}
                />
                <select
                  value={conditionForm.condition_type}
                  onChange={e => setConditionForm(c => ({ ...c, condition_type: e.target.value }))}
                  className="de-select"
                  disabled={saving}
                >
                  {CONDITION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button type="submit" className="de-add-btn" disabled={saving}>
                  <Plus size={14} />
                </button>
              </form>
              <div className="de-list" style={{ marginTop: '10px' }}>
                {myConditions.map(c => (
                  <div key={c.id} className="de-list-item">
                    <div>
                      <span className="de-item-name">{c.name}</span>
                      <span className="de-item-badge" style={{ borderColor: '#fb7185', color: '#fb7185' }}>{c.metadata?.condition_type}</span>
                    </div>
                    <button className="de-remove-btn" onClick={() => handleDeleteRecord(c.id)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ---- Medications Section ---- */}
        <div className="de-section">
          <SectionHeader id="medications" icon={Pill} title="My Medications" count={myMedications.length} color="#34d399" />
          {expandedSection === 'medications' && (
            <div className="de-section-body">
              <form onSubmit={handleAddMedication} className="de-form-row">
                <input
                  placeholder="e.g. Codeine, Ibuprofen"
                  value={medForm.drug_name}
                  onChange={e => setMedForm(m => ({ ...m, drug_name: e.target.value }))}
                  className="de-input"
                  required
                  disabled={saving}
                />
                <select
                  value={medForm.status}
                  onChange={e => setMedForm(m => ({ ...m, status: e.target.value }))}
                  className="de-select"
                  disabled={saving}
                >
                  {MED_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button type="submit" className="de-add-btn" disabled={saving}>
                  <Plus size={14} />
                </button>
              </form>
              <div className="de-list" style={{ marginTop: '10px' }}>
                {myMedications.map(m => (
                  <div key={m.id} className="de-list-item">
                    <div>
                      <span className="de-item-name">{m.name}</span>
                      <span className="de-item-badge" style={{
                        borderColor: m.metadata?.status === 'Active' ? '#34d399' : m.metadata?.status === 'Proposed' ? '#fbbf24' : '#6b7280',
                        color: m.metadata?.status === 'Active' ? '#34d399' : m.metadata?.status === 'Proposed' ? '#fbbf24' : '#6b7280'
                      }}>{m.metadata?.status}</span>
                    </div>
                    <button className="de-remove-btn" onClick={() => handleDeleteRecord(m.id)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary footer */}
      <div className="de-footer">
        <div className="de-summary">
          <span>{activeRelationships.length} connections</span>
          <span>•</span>
          <span>{myConditions.length} conditions</span>
          <span>•</span>
          <span>{myMedications.length} meds</span>
        </div>
        <p className="de-hint">Enter a query in the chat panel to analyze your clinical safety graph →</p>
      </div>
    </div>
  );
};

export default DataEntryPane;
