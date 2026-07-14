import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { runPQTQEvaluation, runCustomEvaluation, pollJobUntilDone } from '../api'
import { useEvaluation } from '../context/EvaluationContext'
import { requestNotificationPermission, sendEvalNotification } from '../utils/notifications'

const ACCENT = '#4F46E5'
const ACCENT_LIGHT = '#EEF2FF'
const ACCENT_MID = '#818CF8'

const STEPS = [
  {
    id: 1, label: 'Document Ingestion', sub: 'Extracting text from documents',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    id: 2, label: 'PQ/TQ Extraction', sub: 'Identifying pre-qualification & technical criteria',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
        <line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    ),
  },
  {
    id: 3, label: 'Bid Evaluation', sub: 'Mapping bid content to each PQ/TQ criterion',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 11l3 3L22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
  },
  {
    id: 4, label: 'Score Calculation', sub: 'Applying weighted scoring rules',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    ),
  },
  {
    id: 5, label: 'Gap Analysis', sub: 'Identifying risks and gaps',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
  {
    id: 6, label: 'Report Generation', sub: 'Compiling final PQTQ evaluation report',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
      </svg>
    ),
  },
]

function UploadZone({ label, sub, file, onFile, accent }) {
  const ref  = useRef()
  const [over, setOver] = useState(false)
  const set = f => { if (f) onFile(f) }
  return (
    <div
      onClick={() => ref.current.click()}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); set(e.dataTransfer.files[0]) }}
      style={{
        border: `2px dashed ${file ? '#22C55E' : over ? accent : '#CBD5E1'}`,
        borderRadius: 12, padding: '2rem 1.5rem', textAlign: 'center',
        cursor: 'pointer', background: file ? '#F0FDF4' : over ? ACCENT_LIGHT : '#FAFAFA',
        transition: 'all .2s', flex: '1 1 0', minWidth: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 200,
      }}
    >
      <input ref={ref} type="file" accept=".pdf,.doc,.docx,.pptx" hidden
        onChange={e => set(e.target.files[0])} />
      <div style={{
        width: 52, height: 52, borderRadius: 12, margin: '0 auto 1rem',
        background: file ? '#DCFCE7' : ACCENT_LIGHT,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
          stroke={file ? '#16A34A' : accent} strokeWidth="1.8">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '1rem' }}>{sub}</div>
      {file
        ? <div style={{ fontSize: '0.82rem', color: '#16A34A', fontWeight: 600 }}>✓ {file.name}</div>
        : <>
            <div style={{
              display: 'inline-block', background: accent, color: '#fff',
              padding: '0.45rem 1.1rem', borderRadius: 8, fontSize: '0.82rem',
              fontWeight: 700, marginBottom: 8,
            }}>Choose File</div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>PDF · DOC · DOCX · PPTX</div>
          </>}
    </div>
  )
}

function MultiUploadZone({ label, sub, files, onFiles, accent }) {
  const ref = useRef()
  const [over, setOver] = useState(false)

  const addFiles = newFiles => {
    if (!newFiles || newFiles.length === 0) return
    const existing = new Set(files.map(f => f.name))
    const toAdd = Array.from(newFiles).filter(f => !existing.has(f.name))
    if (toAdd.length > 0) onFiles([...files, ...toAdd])
  }
  const removeFile = name => onFiles(files.filter(f => f.name !== name))

  return (
    <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <input ref={ref} type="file" accept=".pdf,.doc,.docx,.pptx" multiple hidden
        onChange={e => { addFiles(e.target.files); e.target.value = '' }} />

      {files.length > 0 ? (
        <div style={{
          border: '2px solid #22C55E', borderRadius: 12, padding: '1.25rem',
          background: '#F0FDF4', transition: 'all .2s', flex: 1, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#15803D', marginBottom: 10 }}>
            {label} — {files.length} file{files.length > 1 ? 's' : ''} selected
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {files.map(f => (
              <div key={f.name} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: '#DCFCE7', borderRadius: 8, padding: '0.45rem 0.75rem', minWidth: 0,
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span style={{
                  flex: 1, fontSize: '0.78rem', color: '#15803D', fontWeight: 600,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>✓ {f.name}</span>
                <button onClick={e => { e.stopPropagation(); removeFile(f.name) }} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#16A34A', fontSize: '1rem', lineHeight: 1, padding: '0 2px', flexShrink: 0, fontWeight: 700,
                }}>×</button>
              </div>
            ))}
          </div>
          <div
            onClick={() => ref.current.click()}
            onDragOver={e => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files) }}
            style={{
              border: `1.5px dashed ${over ? accent : '#22C55E'}`,
              borderRadius: 8, padding: '0.55rem 1rem', textAlign: 'center',
              cursor: 'pointer', background: over ? ACCENT_LIGHT : 'transparent', transition: 'all .2s',
            }}
          >
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: accent }}>+ Add More Files</span>
          </div>
        </div>
      ) : (
        <div
          onClick={() => ref.current.click()}
          onDragOver={e => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files) }}
          style={{
            border: `2px dashed ${over ? accent : '#CBD5E1'}`,
            borderRadius: 12, padding: '2rem 1.5rem', textAlign: 'center',
            cursor: 'pointer', background: over ? ACCENT_LIGHT : '#FAFAFA',
            transition: 'all .2s', flex: 1, minHeight: 200,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: 52, height: 52, borderRadius: 12, margin: '0 auto 1rem', background: ACCENT_LIGHT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '1rem' }}>{sub}</div>
          <div style={{
            display: 'inline-block', background: accent, color: '#fff',
            padding: '0.45rem 1.1rem', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, marginBottom: 8,
          }}>Choose Files</div>
          <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>PDF · DOC · DOCX · PPTX · Multiple allowed</div>
        </div>
      )}
    </div>
  )
}

/* ── Custom Criteria Form (PQTQ variant) ─────────────────────────────────── */
const newCriterion = () => ({ id: Date.now() + Math.random(), question: '', maxMarks: 10, mandatory: false })
const newCategory  = () => ({ id: Date.now() + Math.random(), name: '', minimumRequired: 50, criteria: [newCriterion()] })
const DEFAULT_CUSTOM_CRITERIA = { threshold: 50, categories: [newCategory()] }

function buildCriteriaPayload(customCriteria) {
  const totalMarks = customCriteria.categories.reduce(
    (sum, cat) => sum + cat.criteria.reduce((s, c) => s + (Number(c.maxMarks) || 0), 0), 0
  )
  return {
    threshold: customCriteria.threshold,
    categories: customCriteria.categories.map(cat => {
      const catMarks = cat.criteria.reduce((s, c) => s + (Number(c.maxMarks) || 0), 0)
      return {
        name: cat.name,
        weight: totalMarks > 0 ? Math.round(catMarks / totalMarks * 100) : Math.round(100 / customCriteria.categories.length),
        minimum_required: cat.minimumRequired,
        criteria: cat.criteria.map(c => ({ question: c.question, max_marks: Number(c.maxMarks), mandatory: c.mandatory })),
      }
    }),
  }
}

function CustomCriteriaForm({ value, onChange }) {
  const { threshold, categories } = value
  const set = next => onChange(next)
  const addCategory = () => set({ ...value, categories: [...categories, newCategory()] })
  const removeCategory = id => set({ ...value, categories: categories.filter(c => c.id !== id) })
  const updateCat = (id, patch) => set({ ...value, categories: categories.map(c => c.id === id ? { ...c, ...patch } : c) })
  const addCriterion = catId => { const cat = categories.find(c => c.id === catId); updateCat(catId, { criteria: [...cat.criteria, newCriterion()] }) }
  const removeCriterion = (catId, critId) => { const cat = categories.find(c => c.id === catId); if (cat.criteria.length === 1) return; updateCat(catId, { criteria: cat.criteria.filter(c => c.id !== critId) }) }
  const updateCrit = (catId, critId, patch) => { const cat = categories.find(c => c.id === catId); updateCat(catId, { criteria: cat.criteria.map(c => c.id === critId ? { ...c, ...patch } : c) }) }
  const totalMarks = categories.reduce((sum, cat) => sum + cat.criteria.reduce((s, c) => s + (Number(c.maxMarks) || 0), 0), 0)
  const inp = { padding: '0.4rem 0.625rem', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: '0.82rem', color: '#1E293B', outline: 'none', background: '#fff' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '0.75rem 1rem', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', marginBottom: '1.25rem' }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1E293B' }}>Pass Threshold</div>
          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Minimum score % to pass</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="number" min="1" max="100" value={threshold} onChange={e => set({ ...value, threshold: Number(e.target.value) })} style={{ ...inp, width: 58, textAlign: 'center', fontWeight: 700 }} />
          <span style={{ fontSize: '0.82rem', color: '#64748B' }}>%</span>
        </div>
        <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginLeft: 8 }}>Total marks: <strong style={{ color: ACCENT }}>{totalMarks}</strong></div>
      </div>

      {categories.map((cat, catIdx) => {
        const catMarks  = cat.criteria.reduce((s, c) => s + (Number(c.maxMarks) || 0), 0)
        const catWeight = totalMarks > 0 ? Math.round(catMarks / totalMarks * 100) : 0
        return (
          <div key={cat.id} style={{ border: '1px solid #E2E8F0', borderRadius: 10, marginBottom: '0.875rem', overflow: 'hidden' }}>
            <div style={{ background: '#F8FAFC', padding: '0.625rem 1rem', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800, flexShrink: 0 }}>{catIdx + 1}</div>
              <input placeholder="Category name (e.g. Technical Experience)" value={cat.name} onChange={e => updateCat(cat.id, { name: e.target.value })} style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Min</span>
                <input type="number" min="0" max="100" value={cat.minimumRequired} onChange={e => updateCat(cat.id, { minimumRequired: Number(e.target.value) })} style={{ ...inp, width: 42, textAlign: 'center', padding: '2px 4px' }} />
                <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>%</span>
                <span style={{ fontSize: '0.68rem', color: ACCENT, fontWeight: 700, marginLeft: 6 }}>{catMarks}pts · {catWeight}%</span>
              </div>
              {categories.length > 1 && (
                <button onClick={() => removeCategory(cat.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: '1.1rem', lineHeight: 1, padding: '2px 4px', flexShrink: 0 }} onMouseEnter={e => e.target.style.color = '#EF4444'} onMouseLeave={e => e.target.style.color = '#CBD5E1'}>×</button>
              )}
            </div>
            <div style={{ padding: '0.75rem 1rem' }}>
              {cat.criteria.map((crit, critIdx) => (
                <div key={crit.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: '0.68rem', color: '#CBD5E1', width: 14, textAlign: 'right', flexShrink: 0 }}>{critIdx + 1}.</span>
                  <input placeholder={`PQ/TQ criterion ${critIdx + 1}…`} value={crit.question} onChange={e => updateCrit(cat.id, crit.id, { question: e.target.value })} style={{ ...inp, flex: 1 }} onFocus={e => e.target.style.borderColor = ACCENT_MID} onBlur={e => e.target.style.borderColor = '#E2E8F0'} />
                  <input type="number" min="1" max="999" value={crit.maxMarks} onChange={e => updateCrit(cat.id, crit.id, { maxMarks: Number(e.target.value) })} style={{ ...inp, width: 50, textAlign: 'center' }} title="Max marks" />
                  <span style={{ fontSize: '0.68rem', color: '#94A3B8', flexShrink: 0 }}>pts</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', flexShrink: 0 }}>
                    <input type="checkbox" checked={crit.mandatory} onChange={e => updateCrit(cat.id, crit.id, { mandatory: e.target.checked })} style={{ cursor: 'pointer', accentColor: '#DC2626' }} />
                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>Must</span>
                  </label>
                  {cat.criteria.length > 1 && (
                    <button onClick={() => removeCriterion(cat.id, crit.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: '1rem', lineHeight: 1, padding: '2px', flexShrink: 0 }} onMouseEnter={e => e.target.style.color = '#EF4444'} onMouseLeave={e => e.target.style.color = '#CBD5E1'}>×</button>
                  )}
                </div>
              ))}
              <button onClick={() => addCriterion(cat.id)} style={{ marginTop: 4, background: 'none', border: '1px dashed #CBD5E1', borderRadius: 6, padding: '0.3rem 0.75rem', cursor: 'pointer', color: '#94A3B8', fontSize: '0.75rem', fontWeight: 600, transition: 'all .15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT_MID; e.currentTarget.style.color = ACCENT }} onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#94A3B8' }}>+ Add Criterion</button>
            </div>
          </div>
        )
      })}

      <button onClick={addCategory} style={{ width: '100%', padding: '0.6rem', border: '1.5px dashed #CBD5E1', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#64748B', fontSize: '0.8rem', fontWeight: 600, transition: 'all .15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT_MID; e.currentTarget.style.color = ACCENT; e.currentTarget.style.background = ACCENT_LIGHT }} onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#64748B'; e.currentTarget.style.background = 'none' }}>+ Add Category</button>
    </div>
  )
}

function StepCard({ step, state }) {
  const isPending = state === 'pending'
  const isActive  = state === 'active'
  const isDone    = state === 'done'

  return (
    <div style={{
      borderRadius: 18, padding: '2rem 1.75rem',
      border: `2px solid ${isDone ? '#22C55E' : isActive ? ACCENT : '#E2E8F0'}`,
      background: isDone
        ? 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)'
        : isActive
          ? 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)'
          : '#F8FAFC',
      boxShadow: isDone
        ? '0 4px 24px rgba(34,197,94,.15)'
        : isActive
          ? `0 4px 24px rgba(79,70,229,.2), 0 0 0 4px rgba(79,70,229,.08)`
          : '0 1px 4px rgba(0,0,0,.04)',
      transition: 'all .4s cubic-bezier(.34,1.56,.64,1)',
      animation: isActive ? 'cardIn .35s ease-out' : isDone ? 'cardDone .35s ease-out' : 'none',
      opacity: isPending ? 0.55 : 1,
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: '1.25rem', minHeight: 200,
    }}>
      {isActive && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,.5) 50%, transparent 60%)',
          backgroundSize: '200% 100%', animation: 'shimmer 2s linear infinite',
        }}/>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: isDone ? '#22C55E' : isActive ? ACCENT : '#E2E8F0',
          color: isPending ? '#94A3B8' : '#fff',
          fontSize: '0.78rem', fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isActive ? `0 0 0 6px rgba(79,70,229,.2)` : 'none',
          animation: isActive ? 'pulseRing 1.6s ease-in-out infinite' : 'none',
          transition: 'all .3s',
        }}>
          {isDone
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            : step.id}
        </div>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, padding: '4px 12px', borderRadius: 999,
          background: isDone ? '#DCFCE7' : isActive ? ACCENT_LIGHT : '#F1F5F9',
          color: isDone ? '#15803D' : isActive ? ACCENT : '#94A3B8',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {isActive && (
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: ACCENT,
              animation: 'dotPulse .8s ease-in-out infinite alternate', display: 'inline-block',
            }}/>
          )}
          {isDone ? '✓ Done' : isActive ? 'Running…' : 'Pending'}
        </span>
      </div>

      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: isDone ? '#DCFCE7' : isActive ? '#E0E7FF' : '#E2E8F0',
        color: isDone ? '#16A34A' : isActive ? ACCENT : '#94A3B8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .3s',
        animation: isDone ? 'iconPop .4s cubic-bezier(.34,1.56,.64,1)' : 'none',
      }}>
        {step.icon}
      </div>

      <div>
        <div style={{
          fontWeight: 800, fontSize: '1rem',
          color: isDone ? '#15803D' : isActive ? ACCENT : '#94A3B8',
          marginBottom: 4, transition: 'color .3s',
        }}>{step.label}</div>
        <div style={{ fontSize: '0.8rem', color: isDone ? '#16A34A' : isActive ? ACCENT_MID : '#CBD5E1', lineHeight: 1.45 }}>
          {step.sub}
        </div>
      </div>

      {isActive && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: ACCENT_LIGHT, borderRadius: '0 0 16px 16px' }}>
          <div style={{
            height: '100%', background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_MID})`,
            borderRadius: '0 0 16px 16px', animation: 'progressBar 3s ease-in-out infinite',
          }}/>
        </div>
      )}
      {isDone && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: '#22C55E', borderRadius: '0 0 16px 16px' }}/>
      )}
    </div>
  )
}

/* ── Custom PQ/TQ adder helpers ───────────────────────────────────────────── */
const mkPQItem  = () => ({ id: Date.now() + Math.random(), name: '' })
const mkTQCrit  = () => ({ id: Date.now() + Math.random(), name: '', marks: 10 })
const mkTQCat   = () => ({ id: Date.now() + Math.random(), category: '', criteria: [mkTQCrit()] })

function CustomPQTQPanel({ pqItems, tqCats, onPQ, onTQ }) {
  const inp = { padding: '0.4rem 0.7rem', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: '0.82rem', color: '#1E293B', outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box' }

  // PQ handlers
  const addPQ    = () => onPQ([...pqItems, mkPQItem()])
  const removePQ = id => onPQ(pqItems.filter(p => p.id !== id))
  const setPQ    = (id, name) => onPQ(pqItems.map(p => p.id === id ? { ...p, name } : p))

  // TQ handlers
  const addCat       = () => onTQ([...tqCats, mkTQCat()])
  const removeCat    = id => onTQ(tqCats.filter(c => c.id !== id))
  const setCatName   = (id, category) => onTQ(tqCats.map(c => c.id === id ? { ...c, category } : c))
  const addCrit      = catId => onTQ(tqCats.map(c => c.id === catId ? { ...c, criteria: [...c.criteria, mkTQCrit()] } : c))
  const removeCrit   = (catId, critId) => onTQ(tqCats.map(c => c.id === catId ? { ...c, criteria: c.criteria.filter(cr => cr.id !== critId) } : c))
  const setCritField = (catId, critId, patch) => onTQ(tqCats.map(c => c.id === catId ? { ...c, criteria: c.criteria.map(cr => cr.id === critId ? { ...cr, ...patch } : cr) } : c))

  return (
    <div>
      {/* PQ section */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
          <span style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 4, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 800 }}>PQ</span>
          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1E293B' }}>Pre-Qualification Requirements</span>
          <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>— mandatory pass/fail conditions</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pqItems.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.68rem', color: '#CBD5E1', width: 16, flexShrink: 0 }}>{i + 1}.</span>
              <input
                placeholder="e.g. Minimum 3 years of experience in cloud solutions"
                value={p.name}
                onChange={e => setPQ(p.id, e.target.value)}
                style={inp}
                onFocus={e => e.target.style.borderColor = '#FDE68A'}
                onBlur={e => e.target.style.borderColor = '#E2E8F0'}
              />
              <span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 4, padding: '2px 6px', fontSize: '0.6rem', fontWeight: 800, flexShrink: 0 }}>MANDATORY</span>
              {pqItems.length > 1 && (
                <button onClick={() => removePQ(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: '1rem', lineHeight: 1, padding: '2px 4px', flexShrink: 0, fontWeight: 700 }}
                  onMouseEnter={e => e.target.style.color = '#EF4444'} onMouseLeave={e => e.target.style.color = '#CBD5E1'}>×</button>
              )}
            </div>
          ))}
        </div>
        <button onClick={addPQ} style={{ marginTop: 8, background: 'none', border: '1px dashed #FDE68A', borderRadius: 6, padding: '0.3rem 0.85rem', cursor: 'pointer', color: '#92400E', fontSize: '0.75rem', fontWeight: 600, transition: 'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#FFFBEB' }} onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
          + Add PQ Requirement
        </button>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px dashed #E2E8F0', marginBottom: '1.25rem' }} />

      {/* TQ section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
          <span style={{ background: '#EDE9FE', color: '#5B21B6', border: '1px solid #DDD6FE', borderRadius: 4, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 800 }}>TQ</span>
          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1E293B' }}>Technical Qualification Criteria</span>
          <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>— scored criteria with marks</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {tqCats.map((cat, ci) => (
            <div key={cat.id} style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
              {/* Category header row */}
              <div style={{ background: '#F8FAFC', padding: '0.5rem 0.875rem', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, background: ACCENT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 800, flexShrink: 0 }}>{ci + 1}</div>
                <input
                  placeholder="Category name (e.g. Technical Experience)"
                  value={cat.category}
                  onChange={e => setCatName(cat.id, e.target.value)}
                  style={{ ...inp, fontWeight: 600 }}
                  onFocus={e => e.target.style.borderColor = ACCENT_MID}
                  onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                />
                {tqCats.length > 1 && (
                  <button onClick={() => removeCat(cat.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: '1rem', lineHeight: 1, padding: '2px 4px', flexShrink: 0, fontWeight: 700 }}
                    onMouseEnter={e => e.target.style.color = '#EF4444'} onMouseLeave={e => e.target.style.color = '#CBD5E1'}>×</button>
                )}
              </div>
              {/* Criteria rows */}
              <div style={{ padding: '0.625rem 0.875rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cat.criteria.map((cr, cri) => (
                  <div key={cr.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.65rem', color: '#CBD5E1', width: 14, flexShrink: 0 }}>{cri + 1}.</span>
                    <input
                      placeholder={`Criterion ${cri + 1} (e.g. Production GenAI deployments)`}
                      value={cr.name}
                      onChange={e => setCritField(cat.id, cr.id, { name: e.target.value })}
                      style={{ ...inp, flex: 1 }}
                      onFocus={e => e.target.style.borderColor = ACCENT_MID}
                      onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                    />
                    <input
                      type="number" min="1" max="999"
                      value={cr.marks}
                      onChange={e => setCritField(cat.id, cr.id, { marks: Number(e.target.value) })}
                      style={{ ...inp, width: 52, textAlign: 'center', flexShrink: 0 }}
                      title="Max marks"
                    />
                    <span style={{ fontSize: '0.68rem', color: '#94A3B8', flexShrink: 0 }}>pts</span>
                    {cat.criteria.length > 1 && (
                      <button onClick={() => removeCrit(cat.id, cr.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: '1rem', lineHeight: 1, padding: '2px', flexShrink: 0, fontWeight: 700 }}
                        onMouseEnter={e => e.target.style.color = '#EF4444'} onMouseLeave={e => e.target.style.color = '#CBD5E1'}>×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => addCrit(cat.id)} style={{ alignSelf: 'flex-start', marginTop: 2, background: 'none', border: '1px dashed #CBD5E1', borderRadius: 6, padding: '0.25rem 0.65rem', cursor: 'pointer', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, transition: 'all .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT_MID; e.currentTarget.style.color = ACCENT }} onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#94A3B8' }}>
                  + Add Criterion
                </button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addCat} style={{ marginTop: 8, width: '100%', padding: '0.5rem', border: '1.5px dashed #CBD5E1', borderRadius: 8, background: 'none', cursor: 'pointer', color: '#64748B', fontSize: '0.78rem', fontWeight: 600, transition: 'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT_MID; e.currentTarget.style.color = ACCENT; e.currentTarget.style.background = ACCENT_LIGHT }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#64748B'; e.currentTarget.style.background = 'none' }}>
          + Add TQ Category
        </button>
      </div>
    </div>
  )
}

export default function PQTQEvaluatePage() {
  const [rfpFile, setRfpFile]       = useState(null)
  const [bidFiles, setBidFiles]     = useState([])
  const [extraFiles, setExtraFiles] = useState([])
  const [customCriteria, setCustomCriteria] = useState(DEFAULT_CUSTOM_CRITERIA)
  const [useCustomThreshold, setUseCustomThreshold] = useState(false)
  const [customThreshold, setCustomThreshold] = useState(70)
  const [phase, setPhase]           = useState('upload')  // upload | progress | no_rules | error
  const [stepStates, setStepStates] = useState(STEPS.map(() => 'pending'))
  const [error, setError]           = useState('')
  // Custom PQ/TQ panel state
  const [showCustom, setShowCustom] = useState(true)
  const [customPQ, setCustomPQ]     = useState([mkPQItem()])
  const [customTQ, setCustomTQ]     = useState([mkTQCat()])
  const [useReadinessCriteria, setUseReadinessCriteria] = useState(true)
  const { setReport, setRfpName, setBidName, addPQTQCheck, activePQTQ, evalRunning, evalType, setEvalRunning, setEvalType, showToast } = useEvaluation()
  const navigate = useNavigate()

  const hasReadinessCriteria = !!(activePQTQ && (activePQTQ.pq_items?.length > 0 || activePQTQ.tq_items?.length > 0))

  const isCriteriaReady =
    customCriteria.categories.length > 0 &&
    customCriteria.categories.every(cat =>
      cat.name.trim() !== '' &&
      cat.criteria.length > 0 &&
      cat.criteria.every(c => c.question.trim() !== '' && Number(c.maxMarks) > 0)
    )

  const advance = (idx, state) =>
    setStepStates(s => s.map((v, i) => (i === idx ? state : v)))

  function makeTimers() {
    return [
      setTimeout(() => advance(0, 'active'), 100),
      setTimeout(() => { advance(0, 'done'); advance(1, 'active') }, 1200),
      setTimeout(() => { advance(1, 'done'); advance(2, 'active') }, 6000),
      setTimeout(() => { advance(2, 'done'); advance(3, 'active') }, 22000),
      setTimeout(() => { advance(3, 'done'); advance(4, 'active') }, 28000),
      setTimeout(() => { advance(4, 'done'); advance(5, 'active') }, 38000),
    ]
  }

  async function finishEvaluation(report, rfpName) {
    setStepStates(STEPS.map(() => 'done'))
    setReport(report)
    setRfpName(rfpName)
    const bidName = bidFiles.map(f => f.name).join(', ')
    setBidName(bidName)
    const rawScore = report.max_score > 0
      ? Math.round((report.total_score / report.max_score) * 100)
      : null
    addPQTQCheck({
      id: report.evaluation_id || Date.now(),
      rfpName,
      bidName,
      report,
      timestamp: new Date().toISOString(),
      score: rawScore,
      passed: report.passed ?? null,
      evaluationType: 'PQTQ',
    })
    setEvalRunning(false)
    setEvalType(null)
    const scoreText = rawScore !== null ? `Score: ${rawScore}% — ${report.passed ? 'Pass ✓' : 'Fail ✗'}` : 'Evaluation complete'
    showToast('PQTQ Report Ready', `${rfpName} · ${scoreText}`, rawScore, report.passed)
    sendEvalNotification('BidEval — PQTQ Report Ready', `${rfpName} · ${scoreText}`)
    setTimeout(() => navigate('/active-evaluation'), 500)
  }

  async function handleEvaluate() {
    setPhase('progress')
    setStepStates(STEPS.map(() => 'pending'))
    setError('')
    await requestNotificationPermission()
    setEvalRunning(true)
    setEvalType('pqtq')
    const timers = makeTimers()
    try {
      const readinessRules = (hasReadinessCriteria && useReadinessCriteria)
        ? { pq_items: activePQTQ.pq_items, tq_items: activePQTQ.tq_items }
        : null
      const { job_id } = await runPQTQEvaluation(rfpFile, bidFiles, extraFiles, readinessRules, useCustomThreshold ? customThreshold : null)
      const job = await pollJobUntilDone(job_id)
      timers.forEach(clearTimeout)
      if (job.status === 'failed') throw new Error(job.error_message || 'Evaluation failed')
      await finishEvaluation(job.result, rfpFile.name)
    } catch (e) {
      timers.forEach(clearTimeout)
      setEvalRunning(false)
      setEvalType(null)
      if (e.message.includes('NO_RULES_FOUND')) {
        setPhase('no_rules')
      } else {
        setError(e.message)
        setPhase('error')
      }
    }
  }

  // Ready check for the custom PQ/TQ panel
  const customPQValid = customPQ.every(p => p.name.trim() !== '')
  const customTQValid = customTQ.every(c => c.category.trim() !== '' && c.criteria.every(cr => cr.name.trim() !== '' && cr.marks > 0))
  const customPanelReady = bidFiles.length > 0 && (customPQ.some(p => p.name.trim()) || customTQ.some(c => c.category.trim())) && customPQValid && customTQValid

  async function handleRunCustomPQTQ() {
    const categories = []

    const filledPQ = customPQ.filter(p => p.name.trim())
    if (filledPQ.length > 0) {
      categories.push({
        name: 'Pre-Qualification Requirements',
        minimum_required: 100,
        criteria: filledPQ.map(p => ({ question: p.name.trim(), max_marks: 10, mandatory: true })),
      })
    }

    customTQ.filter(c => c.category.trim()).forEach(cat => {
      const filledCriteria = cat.criteria.filter(cr => cr.name.trim() && cr.marks > 0)
      if (filledCriteria.length > 0) {
        categories.push({
          name: cat.category.trim(),
          minimum_required: 0,
          criteria: filledCriteria.map(cr => ({ question: cr.name.trim(), max_marks: Number(cr.marks), mandatory: false })),
        })
      }
    })

    if (categories.length === 0) return

    setPhase('progress')
    setStepStates(STEPS.map(() => 'pending'))
    setError('')
    const timers = makeTimers()
    try {
      const { job_id } = await runCustomEvaluation(bidFiles, buildCriteriaPayload({
        threshold: 70,
        categories: categories.map(c => ({
          id: Date.now() + Math.random(),
          name: c.name,
          minimumRequired: c.minimum_required,
          criteria: c.criteria.map(cr => ({ id: Date.now() + Math.random(), question: cr.question, maxMarks: cr.max_marks, mandatory: cr.mandatory })),
        })),
      }))
      const job = await pollJobUntilDone(job_id)
      timers.forEach(clearTimeout)
      if (job.status === 'failed') throw new Error(job.error_message || 'Evaluation failed')
      await finishEvaluation(job.result, rfpFile?.name ?? 'Custom PQTQ Criteria')
    } catch (e) {
      timers.forEach(clearTimeout)
      setError(e.message)
      setPhase('error')
    }
  }

  async function handleEvaluateCustom() {
    setPhase('progress')
    setStepStates(STEPS.map(() => 'pending'))
    setError('')
    const timers = makeTimers()
    try {
      const { job_id } = await runCustomEvaluation([...bidFiles, ...extraFiles], buildCriteriaPayload(customCriteria))
      const job = await pollJobUntilDone(job_id)
      timers.forEach(clearTimeout)
      if (job.status === 'failed') throw new Error(job.error_message || 'Evaluation failed')
      await finishEvaluation(job.result, rfpFile?.name ?? 'PQTQ Custom Criteria')
    } catch (e) {
      timers.forEach(clearTimeout)
      setError(e.message)
      setPhase('no_rules')
    }
  }

  if (phase === 'no_rules') {
    return (
      <div className="page-content fade-in">
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ background: ACCENT_LIGHT, border: `1px solid #C7D2FE`, borderRadius: 8, padding: '3px 10px', fontSize: '0.68rem', fontWeight: 800, color: ACCENT, letterSpacing: '0.06em' }}>PQTQ</div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Define PQ/TQ Criteria</h1>
          </div>
          <p style={{ color: '#64748B', margin: 0 }}>
            No PQ/TQ scoring criteria with numeric marks were found in the RFP. Define criteria manually — the AI will evaluate the bid against them.
          </p>
        </div>

        {/* Uploaded files summary */}
        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {rfpFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: ACCENT_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>RFP</div>
                <div style={{ fontSize: '0.8rem', color: '#1E293B', fontWeight: 600 }}>{rfpFile.name}</div>
              </div>
            </div>
          )}
          {bidFiles.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>BID{bidFiles.length > 1 ? 'S' : ''}</div>
                <div style={{ fontSize: '0.8rem', color: '#1E293B', fontWeight: 600 }}>{bidFiles.map(f => f.name).join(', ')}</div>
              </div>
            </div>
          )}
          {extraFiles.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>SUPPORTING</div>
                <div style={{ fontSize: '0.8rem', color: '#1E293B', fontWeight: 600 }}>{extraFiles.map(f => f.name).join(', ')}</div>
              </div>
            </div>
          )}
          <button onClick={() => setPhase('upload')} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, padding: '0.35rem 0.75rem', cursor: 'pointer', fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>← Change files</button>
        </div>

        {error && (
          <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderLeft: '4px solid #EF4444', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ fontWeight: 700, color: '#BE123C', marginBottom: 4 }}>Evaluation Failed</div>
            <div style={{ fontSize: '0.875rem', color: '#9F1239' }}>{error}</div>
          </div>
        )}

        <div className="card" style={{ padding: '2rem' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1E293B', marginBottom: '0.5rem' }}>PQ/TQ Scoring Criteria</div>
          <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '1.25rem' }}>
            Define Pre-Qualification and Technical Qualification categories and criteria. The AI will score the bid on each one.
          </div>
          <CustomCriteriaForm value={customCriteria} onChange={setCustomCriteria} />
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '1.5rem', textAlign: 'center', marginTop: '1.5rem' }}>
            <button
              className="btn btn-primary"
              style={{ padding: '0.75rem 2.5rem', fontSize: '1rem', background: ACCENT, borderColor: ACCENT }}
              disabled={!isCriteriaReady}
              onClick={handleEvaluateCustom}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Run PQTQ Evaluation
            </button>
            <p style={{ marginTop: 10, fontSize: '0.78rem', color: '#94A3B8' }}>Powered by Groq LLaMA — results in 3–4 minutes</p>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'progress') {
    const doneCount = stepStates.filter(s => s === 'done').length
    const progressPct = Math.round((doneCount / STEPS.length) * 100)

    return (
      <div className="page-content fade-in" style={{ maxWidth: 'none' }}>
        <style>{`
          @keyframes spin        { to { transform: rotate(360deg); } }
          @keyframes shimmer     { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
          @keyframes pulseRing   { 0%,100% { box-shadow: 0 0 0 0 rgba(79,70,229,.4); } 50% { box-shadow: 0 0 0 10px rgba(79,70,229,0); } }
          @keyframes dotPulse    { from { opacity: .4; transform: scale(.8); } to { opacity: 1; transform: scale(1.2); } }
          @keyframes cardIn      { from { opacity: 0; transform: translateY(12px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
          @keyframes cardDone    { 0% { transform: scale(1); } 40% { transform: scale(1.03); } 100% { transform: scale(1); } }
          @keyframes iconPop     { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
          @keyframes progressBar { 0% { width: 0%; } 60% { width: 85%; } 100% { width: 95%; } }
        `}</style>

        <div style={{ marginBottom: '2.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827', marginBottom: 6 }}>
              PQTQ Evaluation in Progress
            </h1>
            <p style={{ color: '#64748B', fontSize: '0.9rem', margin: 0 }}>
              AI pipeline analyzing Pre-Qualification & Technical Qualification criteria — this takes 3–4 minutes
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: ACCENT_LIGHT, borderRadius: 12, padding: '0.75rem 1.25rem' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              border: `3px solid #C7D2FE`, borderTop: `3px solid ${ACCENT}`,
              animation: 'spin 1s linear infinite',
            }}/>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: ACCENT }}>
                Step {Math.min(doneCount + 1, STEPS.length)} of {STEPS.length}
              </div>
              <div style={{ fontSize: '0.72rem', color: ACCENT_MID }}>Do not close this window</div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B' }}>Overall Progress</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: ACCENT }}>{progressPct}%</span>
          </div>
          <div style={{ height: 8, background: '#E2E8F0', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 999,
              background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_MID})`,
              width: `${progressPct}%`,
              transition: 'width .6s cubic-bezier(.34,1.56,.64,1)',
            }}/>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
          {STEPS.map((s, i) => <StepCard key={s.id} step={s} state={stepStates[i]} />)}
        </div>
      </div>
    )
  }

  if (evalRunning && evalType === 'pqtq') {
    return (
      <div className="page-content fade-in">
        <div style={{ maxWidth: 520, margin: '4rem auto', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: ACCENT_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1E293B', marginBottom: 8 }}>PQTQ Evaluation Running in Background</h2>
          <p style={{ color: '#64748B', fontSize: '0.9rem', lineHeight: 1.6 }}>
            Your PQTQ evaluation is processing. You can navigate freely — the results will be saved automatically and you'll land on the results page when done.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{
            background: ACCENT_LIGHT, border: `1px solid #C7D2FE`,
            borderRadius: 8, padding: '3px 10px',
            fontSize: '0.68rem', fontWeight: 800, color: ACCENT, letterSpacing: '0.06em',
          }}>PQTQ</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>PQTQ Evaluation</h1>
        </div>
        <p style={{ color: '#64748B', margin: 0 }}>
          Evaluates only Pre-Qualification &amp; Technical Qualification criteria from the RFP — financial and commercial sections are excluded
        </p>
      </div>

      {phase === 'error' && (
        <div style={{
          background: '#FFF1F2', border: '1px solid #FECDD3', borderLeft: '4px solid #EF4444',
          borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.5rem',
        }}>
          <div style={{ fontWeight: 700, color: '#BE123C', marginBottom: 4 }}>Evaluation Failed</div>
          <div style={{ fontSize: '0.875rem', color: '#9F1239' }}>{error}</div>
        </div>
      )}

      {/* Readiness criteria banner */}
      {hasReadinessCriteria && (
        <div style={{
          background: useReadinessCriteria
            ? 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)'
            : '#F8FAFC',
          border: `2px solid ${useReadinessCriteria ? '#22C55E' : '#E2E8F0'}`,
          borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem',
          display: 'flex', alignItems: 'center', gap: 14,
          transition: 'all .25s',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: useReadinessCriteria ? '#22C55E' : '#E2E8F0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .25s',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke={useReadinessCriteria ? '#fff' : '#94A3B8'} strokeWidth="2.5">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontWeight: 700, fontSize: '0.9rem',
              color: useReadinessCriteria ? '#15803D' : '#64748B',
            }}>
              {useReadinessCriteria
                ? '✓ Using criteria from PQTQ Readiness check'
                : 'Pre-validated criteria available'}
            </div>
            <div style={{ fontSize: '0.78rem', color: useReadinessCriteria ? '#16A34A' : '#94A3B8', marginTop: 2 }}>
              {activePQTQ.pq_items?.length || 0} PQ + {activePQTQ.tq_items?.length || 0} TQ criteria
              from "{activePQTQ.rfpName}"
              {useReadinessCriteria
                ? ' — ensures identical criteria between readiness check and evaluation'
                : ' — click to use the same criteria'}
            </div>
          </div>
          <button
            onClick={() => setUseReadinessCriteria(v => !v)}
            style={{
              padding: '7px 16px', borderRadius: 8, fontWeight: 700, fontSize: '0.8rem',
              border: 'none', cursor: 'pointer', flexShrink: 0,
              background: useReadinessCriteria ? '#fff' : '#22C55E',
              color: useReadinessCriteria ? '#6B7280' : '#fff',
              boxShadow: useReadinessCriteria ? 'none' : '0 2px 8px rgba(34,197,94,.3)',
              transition: 'all .2s',
            }}
          >
            {useReadinessCriteria ? 'Use Fresh Extraction' : 'Use Readiness Criteria'}
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(300px, 28%)', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" style={{ padding: '2rem' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '1.25rem', color: '#1E293B' }}>
              Upload Documents
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', alignItems: 'stretch', minHeight: 200 }}>
              <UploadZone
                label="RFP / Tender Document"
                sub="Must contain PQ/TQ scoring criteria with numeric marks"
                file={rfpFile} onFile={setRfpFile} accent={ACCENT}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: '#F1F5F9',
                  border: '2px solid #E2E8F0', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '0.78rem', fontWeight: 800, color: '#94A3B8',
                }}>VS</div>
              </div>
              <MultiUploadZone
                label="Vendor Bid Document"
                sub="The vendor's response to be evaluated"
                files={bidFiles} onFiles={setBidFiles} accent={ACCENT}
              />
            </div>

            {/* Optional supporting documents */}
            <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
                <span style={{ background: '#F1F5F9', borderRadius: 4, padding: '1px 7px', fontSize: '0.65rem', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.04em' }}>OPTIONAL</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Supporting Documents</span>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>— PQ evidence, certificates, company profiles</span>
              </div>
              <MultiUploadZone
                label="PQ Evidence / Supporting Docs"
                sub="Certificates, registration letters, experience proof (PDF, DOCX)"
                files={extraFiles} onFiles={setExtraFiles} accent={ACCENT}
              />
            </div>

            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem', padding: '0.75rem 1rem', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={useCustomThreshold}
                    onChange={e => setUseCustomThreshold(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: ACCENT, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>Override pass threshold</span>
                  <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>(default: extracted from RFP)</span>
                </label>
                {useCustomThreshold && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      min={50}
                      max={100}
                      value={customThreshold}
                      onChange={e => setCustomThreshold(Math.max(50, Math.min(100, Number(e.target.value))))}
                      style={{ width: 70, padding: '0.35rem 0.5rem', border: `1.5px solid ${ACCENT}`, borderRadius: 6, fontSize: '0.9rem', fontWeight: 700, color: '#1E293B', textAlign: 'center', outline: 'none' }}
                    />
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: ACCENT }}>%</span>
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'center' }}>
                <button
                  className="btn btn-primary"
                  style={{ padding: '0.75rem 2.5rem', fontSize: '1rem', background: ACCENT, borderColor: ACCENT }}
                  disabled={!rfpFile || bidFiles.length === 0}
                  onClick={handleEvaluate}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  Run PQTQ Evaluation
                </button>
                <p style={{ marginTop: 10, fontSize: '0.78rem', color: '#94A3B8' }}>
                  Powered by Groq LLaMA — results in 3–4 minutes
                </p>
              </div>
            </div>
          </div>

          {/* Custom PQ/TQ Panel */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Toggle header */}
            <button
              onClick={() => setShowCustom(v => !v)}
              style={{ width: '100%', padding: '0.875rem 1.25rem', background: showCustom ? ACCENT_LIGHT : '#F8FAFC', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', borderBottom: showCustom ? '1px solid #C7D2FE' : 'none' }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 7, background: showCustom ? ACCENT : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .2s' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={showCustom ? '#fff' : '#94A3B8'} strokeWidth="2.5">
                  {showCustom
                    ? <line x1="5" y1="12" x2="19" y2="12"/>
                    : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: showCustom ? ACCENT : '#1E293B' }}>Add Custom PQ / TQ Criteria</div>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 1 }}>Manually define requirements — AI will score the bid against them</div>
              </div>
              {(customPQ.some(p => p.name.trim()) || customTQ.some(c => c.category.trim())) && (
                <span style={{ background: ACCENT, color: '#fff', borderRadius: 999, fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', flexShrink: 0 }}>
                  {customPQ.filter(p => p.name.trim()).length + customTQ.flatMap(c => c.criteria.filter(cr => cr.name.trim())).length} added
                </span>
              )}
            </button>

            {showCustom && (
              <div style={{ padding: '1.25rem' }}>
                <CustomPQTQPanel pqItems={customPQ} tqCats={customTQ} onPQ={setCustomPQ} onTQ={setCustomTQ} />
                <div style={{ borderTop: '1px solid #E2E8F0', marginTop: '1.25rem', paddingTop: '1.25rem', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={handleRunCustomPQTQ}
                    disabled={!customPanelReady}
                    style={{ flex: 1, padding: '0.65rem 1.25rem', background: customPanelReady ? ACCENT : '#E2E8F0', color: customPanelReady ? '#fff' : '#94A3B8', border: 'none', borderRadius: 8, cursor: customPanelReady ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .2s' }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    Run with Custom Criteria
                  </button>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.4, maxWidth: 160 }}>
                    {bidFiles.length === 0 ? 'Upload a bid document first' : !customPanelReady ? 'Fill in all criteria fields' : 'Uses bid doc + your criteria'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Upload status */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.875rem', color: '#1E293B' }}>
              Upload Status
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* RFP */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '0.7rem 1rem', borderRadius: 8,
                background: rfpFile ? '#F0FDF4' : '#F8FAFC',
                border: `1px solid ${rfpFile ? '#BBF7D0' : '#E2E8F0'}`,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: rfpFile ? '#DCFCE7' : '#E2E8F0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke={rfpFile ? '#16A34A' : '#94A3B8'} strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>RFP / Tender Document</div>
                  <div style={{ fontSize: '0.72rem', color: rfpFile ? '#16A34A' : '#94A3B8',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {rfpFile ? rfpFile.name : 'No file selected'}
                  </div>
                </div>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                  background: rfpFile ? '#DCFCE7' : '#F1F5F9',
                  color: rfpFile ? '#15803D' : '#64748B',
                }}>{rfpFile ? 'Ready' : 'Pending'}</span>
              </div>

              {/* Bid files */}
              {bidFiles.length === 0 ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '0.7rem 1rem', borderRadius: 8,
                  background: '#F8FAFC', border: '1px solid #E2E8F0',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6, background: '#E2E8F0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>Vendor Bid Documents</div>
                    <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>No files selected</div>
                  </div>
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                    background: '#F1F5F9', color: '#64748B',
                  }}>Pending</span>
                </div>
              ) : bidFiles.map((f, i) => (
                <div key={f.name} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '0.7rem 1rem', borderRadius: 8,
                  background: '#F0FDF4', border: '1px solid #BBF7D0',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6, background: '#DCFCE7',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                      Vendor Bid {bidFiles.length > 1 ? `#${i + 1}` : 'Document'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#16A34A',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.name}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                    background: '#DCFCE7', color: '#15803D',
                  }}>Ready</span>
                </div>
              ))}

              {/* Supporting docs status row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '0.7rem 1rem', borderRadius: 8,
                background: extraFiles.length > 0 ? '#F5F3FF' : '#F8FAFC',
                border: `1px solid ${extraFiles.length > 0 ? '#DDD6FE' : '#E2E8F0'}`,
              }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: extraFiles.length > 0 ? '#EDE9FE' : '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={extraFiles.length > 0 ? '#7C3AED' : '#94A3B8'} strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                    Supporting Documents
                    {extraFiles.length === 0 && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700 }}>OPTIONAL</span>}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: extraFiles.length > 0 ? '#7C3AED' : '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {extraFiles.length > 0 ? `${extraFiles.length} file${extraFiles.length > 1 ? 's' : ''} — ${extraFiles.map(f => f.name).join(', ')}` : 'Not uploaded'}
                  </div>
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: extraFiles.length > 0 ? '#EDE9FE' : '#F1F5F9', color: extraFiles.length > 0 ? '#5B21B6' : '#94A3B8' }}>
                  {extraFiles.length > 0 ? 'Ready' : 'Skipped'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '1.25rem', color: '#1E293B' }}>How PQTQ mode works</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                { n: '01', t: 'Upload RFP + Bid', d: 'Same as standard evaluation — PDF or Word format', color: ACCENT },
                { n: '02', t: 'PQ/TQ Scope Filter', d: 'AI extracts only pre-qualification and technical criteria, ignoring financial/commercial sections', color: ACCENT_MID },
                { n: '03', t: 'Scoped Results', d: 'Receive detailed PQ/TQ scores, gap analysis, and PASS/FAIL verdict', color: '#22C55E' },
              ].map(s => (
                <div key={s.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: s.color + '18',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.68rem', fontWeight: 800, color: s.color,
                  }}>{s.n}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: 2 }}>{s.t}</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: 1.5 }}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '1rem', color: '#1E293B' }}>What gets evaluated</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {[
                { icon: '✅', tip: 'Pre-Qualification eligibility criteria with explicit numeric marks' },
                { icon: '✅', tip: 'Technical qualification sections (experience, team, capacity)' },
                { icon: '❌', tip: 'Financial bid, price, and commercial evaluation — excluded' },
                { icon: '❌', tip: 'Document submission checklists (EMD, bank guarantee) — excluded' },
              ].map(({ icon, tip }) => (
                <div key={tip} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.85rem', flexShrink: 0, marginTop: 1 }}>{icon}</span>
                  <span style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: 1.5 }}>{tip}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{
            padding: '1.25rem',
            background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
            border: '1px solid #C7D2FE',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: ACCENT }}>Scope note</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#4338CA', margin: 0, lineHeight: 1.5 }}>
              If the RFP does not contain explicit numeric marks for PQ/TQ criteria, the evaluation will return an error (no fallback to custom criteria).
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
