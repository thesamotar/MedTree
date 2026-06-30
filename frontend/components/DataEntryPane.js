'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { UserPlus, HeartPulse, Pill, Home, Plus, Trash2, ChevronDown, ChevronRight, Save } from 'lucide-react';

const RELATIONSHIP_TYPES = ['Self', 'Parent', 'Child', 'Sibling', 'Spouse', 'Roommate'];
const CONDITION_TYPES = ['Genetic', 'Autoimmune', 'Chronic', 'Symptom', 'Allergy'];
const MED_STATUSES = ['Active', 'Proposed', 'Discontinued'];

const DataEntryPane = ({ userId, entries, setEntries, onDataChange }) => {
  const supabase = createClient();
  const [expandedSection, setExpandedSection] = useState('people');
  const [saving, setSaving] = useState(false);

  // ---------- Form state for each section ----------
  const [personForm, setPersonForm] = useState({ name: '', relationship: 'Self', age: '' });
  const [conditionForm, setConditionForm] = useState({ person_name: '', condition_name: '', condition_type: 'Chronic' });
  const [medForm, setMedForm] = useState({ person_name: '', drug_name: '', status: 'Active' });
  const [locationForm, setLocationForm] = useState({ location_name: '', residents: '' });

  // Derived lists
  const people = entries.filter(e => e.entry_type === 'person');
  const conditions = entries.filter(e => e.entry_type === 'condition');
  const medications = entries.filter(e => e.entry_type === 'medication');
  const locations = entries.filter(e => e.entry_type === 'location');
  const personNames = people.map(p => p.data.name);

  // ---------- CRUD helpers ----------
  const addEntry = async (entry_type, data) => {
    setSaving(true);
    const newEntry = { user_id: userId, entry_type, data };

    const { data: inserted, error } = await supabase
      .from('medical_entries')
      .insert(newEntry)
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      // Fallback: add locally with temp id
      const localEntry = { ...newEntry, id: `local_${Date.now()}`, created_at: new Date().toISOString() };
      setEntries(prev => [...prev, localEntry]);
    } else {
      setEntries(prev => [...prev, inserted]);
    }
    setSaving(false);
    onDataChange?.();
  };

  const removeEntry = async (id) => {
    if (id.startsWith?.('local_')) {
      setEntries(prev => prev.filter(e => e.id !== id));
    } else {
      await supabase.from('medical_entries').delete().eq('id', id);
      setEntries(prev => prev.filter(e => e.id !== id));
    }
    onDataChange?.();
  };

  // ---------- Section handlers ----------
  const handleAddPerson = (e) => {
    e.preventDefault();
    if (!personForm.name.trim()) return;
    addEntry('person', { ...personForm, age: parseInt(personForm.age) || null });
    setPersonForm({ name: '', relationship: 'Self', age: '' });
  };

  const handleAddCondition = (e) => {
    e.preventDefault();
    if (!conditionForm.person_name || !conditionForm.condition_name.trim()) return;
    addEntry('condition', { ...conditionForm });
    setConditionForm({ person_name: conditionForm.person_name, condition_name: '', condition_type: 'Chronic' });
  };

  const handleAddMedication = (e) => {
    e.preventDefault();
    if (!medForm.person_name || !medForm.drug_name.trim()) return;
    addEntry('medication', { ...medForm });
    setMedForm({ person_name: medForm.person_name, drug_name: '', status: 'Active' });
  };

  const handleAddLocation = (e) => {
    e.preventDefault();
    if (!locationForm.location_name.trim()) return;
    const residentsArr = locationForm.residents.split(',').map(r => r.trim()).filter(Boolean);
    addEntry('location', { location_name: locationForm.location_name, residents: residentsArr });
    setLocationForm({ location_name: '', residents: '' });
  };

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const SectionHeader = ({ id, icon: Icon, title, count, color }) => (
    <button className="de-section-header" onClick={() => toggleSection(id)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon size={18} style={{ color }} />
        <span>{title}</span>
        <span className="de-count">{count}</span>
      </div>
      {expandedSection === id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
    </button>
  );

  return (
    <div className="data-entry-pane">
      <div className="de-header">
        <h2 className="de-title">Medical Profile</h2>
        <p className="de-subtitle">Add your medical data to build your health graph</p>
      </div>

      <div className="de-sections">
        {/* ---- People Section ---- */}
        <div className="de-section">
          <SectionHeader id="people" icon={UserPlus} title="People & Relationships" count={people.length} color="#60a5fa" />
          {expandedSection === 'people' && (
            <div className="de-section-body">
              <form onSubmit={handleAddPerson} className="de-form-row">
                <input
                  placeholder="Name"
                  value={personForm.name}
                  onChange={e => setPersonForm(p => ({ ...p, name: e.target.value }))}
                  className="de-input"
                  required
                />
                <select
                  value={personForm.relationship}
                  onChange={e => setPersonForm(p => ({ ...p, relationship: e.target.value }))}
                  className="de-select"
                >
                  {RELATIONSHIP_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <input
                  placeholder="Age"
                  type="number"
                  value={personForm.age}
                  onChange={e => setPersonForm(p => ({ ...p, age: e.target.value }))}
                  className="de-input de-input-small"
                />
                <button type="submit" className="de-add-btn" disabled={saving}>
                  <Plus size={14} />
                </button>
              </form>
              <div className="de-list">
                {people.map(p => (
                  <div key={p.id} className="de-list-item">
                    <div>
                      <span className="de-item-name">{p.data.name}</span>
                      <span className="de-item-badge" style={{ borderColor: '#60a5fa', color: '#60a5fa' }}>{p.data.relationship}</span>
                      {p.data.age && <span className="de-item-meta">Age {p.data.age}</span>}
                    </div>
                    <button className="de-remove-btn" onClick={() => removeEntry(p.id)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ---- Conditions Section ---- */}
        <div className="de-section">
          <SectionHeader id="conditions" icon={HeartPulse} title="Conditions & Markers" count={conditions.length} color="#fb7185" />
          {expandedSection === 'conditions' && (
            <div className="de-section-body">
              <form onSubmit={handleAddCondition} className="de-form-row">
                <select
                  value={conditionForm.person_name}
                  onChange={e => setConditionForm(c => ({ ...c, person_name: e.target.value }))}
                  className="de-select"
                  required
                >
                  <option value="">Link to person…</option>
                  {personNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <input
                  placeholder="Condition name"
                  value={conditionForm.condition_name}
                  onChange={e => setConditionForm(c => ({ ...c, condition_name: e.target.value }))}
                  className="de-input"
                  required
                />
                <select
                  value={conditionForm.condition_type}
                  onChange={e => setConditionForm(c => ({ ...c, condition_type: e.target.value }))}
                  className="de-select"
                >
                  {CONDITION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button type="submit" className="de-add-btn" disabled={saving}>
                  <Plus size={14} />
                </button>
              </form>
              <div className="de-list">
                {conditions.map(c => (
                  <div key={c.id} className="de-list-item">
                    <div>
                      <span className="de-item-name">{c.data.condition_name}</span>
                      <span className="de-item-badge" style={{ borderColor: '#fb7185', color: '#fb7185' }}>{c.data.condition_type}</span>
                      <span className="de-item-meta">→ {c.data.person_name}</span>
                    </div>
                    <button className="de-remove-btn" onClick={() => removeEntry(c.id)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ---- Medications Section ---- */}
        <div className="de-section">
          <SectionHeader id="medications" icon={Pill} title="Medications" count={medications.length} color="#34d399" />
          {expandedSection === 'medications' && (
            <div className="de-section-body">
              <form onSubmit={handleAddMedication} className="de-form-row">
                <select
                  value={medForm.person_name}
                  onChange={e => setMedForm(m => ({ ...m, person_name: e.target.value }))}
                  className="de-select"
                  required
                >
                  <option value="">Link to person…</option>
                  {personNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <input
                  placeholder="Drug name"
                  value={medForm.drug_name}
                  onChange={e => setMedForm(m => ({ ...m, drug_name: e.target.value }))}
                  className="de-input"
                  required
                />
                <select
                  value={medForm.status}
                  onChange={e => setMedForm(m => ({ ...m, status: e.target.value }))}
                  className="de-select"
                >
                  {MED_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button type="submit" className="de-add-btn" disabled={saving}>
                  <Plus size={14} />
                </button>
              </form>
              <div className="de-list">
                {medications.map(m => (
                  <div key={m.id} className="de-list-item">
                    <div>
                      <span className="de-item-name">{m.data.drug_name}</span>
                      <span className="de-item-badge" style={{
                        borderColor: m.data.status === 'Active' ? '#34d399' : m.data.status === 'Proposed' ? '#fbbf24' : '#6b7280',
                        color: m.data.status === 'Active' ? '#34d399' : m.data.status === 'Proposed' ? '#fbbf24' : '#6b7280'
                      }}>{m.data.status}</span>
                      <span className="de-item-meta">→ {m.data.person_name}</span>
                    </div>
                    <button className="de-remove-btn" onClick={() => removeEntry(m.id)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ---- Locations Section ---- */}
        <div className="de-section">
          <SectionHeader id="locations" icon={Home} title="Living Arrangements" count={locations.length} color="#fbbf24" />
          {expandedSection === 'locations' && (
            <div className="de-section-body">
              <form onSubmit={handleAddLocation} className="de-form-row">
                <input
                  placeholder="Location name (e.g. Apartment 3B)"
                  value={locationForm.location_name}
                  onChange={e => setLocationForm(l => ({ ...l, location_name: e.target.value }))}
                  className="de-input"
                  required
                />
                <input
                  placeholder="Residents (comma-separated names)"
                  value={locationForm.residents}
                  onChange={e => setLocationForm(l => ({ ...l, residents: e.target.value }))}
                  className="de-input"
                />
                <button type="submit" className="de-add-btn" disabled={saving}>
                  <Plus size={14} />
                </button>
              </form>
              <div className="de-list">
                {locations.map(l => (
                  <div key={l.id} className="de-list-item">
                    <div>
                      <span className="de-item-name">{l.data.location_name}</span>
                      {l.data.residents?.length > 0 && (
                        <span className="de-item-meta">Residents: {l.data.residents.join(', ')}</span>
                      )}
                    </div>
                    <button className="de-remove-btn" onClick={() => removeEntry(l.id)}><Trash2 size={13} /></button>
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
          <span>{people.length} people</span>
          <span>•</span>
          <span>{conditions.length} conditions</span>
          <span>•</span>
          <span>{medications.length} meds</span>
          <span>•</span>
          <span>{locations.length} locations</span>
        </div>
        <p className="de-hint">Enter a query in the chat panel to analyze your medical graph →</p>
      </div>
    </div>
  );
};

export default DataEntryPane;
