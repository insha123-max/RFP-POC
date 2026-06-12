import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { runEvaluation, runCustomEvaluation } from '../api'
import { useEvaluation } from '../context/EvaluationContext'

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
    id: 2, label: 'Criteria Extraction', sub: 'Identifying scoring rules from RFP',
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
    id: 3, label: 'Bid Evaluation', sub: 'Mapping bid content to each criterion',
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
    id: 6, label: 'Report Generation', sub: 'Compiling final evaluation report',
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
        cursor: 'pointer', background: file ? '#F0FDF4' : over ? '#FEF0E8' : '#FAFAFA',
        transition: 'all .2s', flex: '1 1 0', minWidth: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: 200,
      }}
    >
      <input ref={ref} type="file" accept=".pdf,.doc,.docx,.pptx" hidden
        onChange={e => set(e.target.files[0])} />
      <div style={{
        width: 52, height: 52, borderRadius: 12, margin: '0 auto 1rem',
        background: file ? '#DCFCE7' : '#FEF0E8',
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
                background: '#DCFCE7', borderRadius: 8, padding: '0.45rem 0.75rem',
                minWidth: 0,
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" style={{ flexShrink: 0 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span style={{
                  flex: 1, fontSize: '0.78rem', color: '#15803D', fontWeight: 600,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>✓ {f.name}</span>
                <button
                  onClick={e => { e.stopPropagation(); removeFile(f.name) }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#16A34A', fontSize: '1rem', lineHeight: 1,
                    padding: '0 2px', flexShrink: 0, fontWeight: 700,
                  }}
                >×</button>
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
              cursor: 'pointer', background: over ? '#FEF0E8' : 'transparent',
              transition: 'all .2s',
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
            cursor: 'pointer', background: over ? '#FEF0E8' : '#FAFAFA',
            transition: 'all .2s', flex: 1, minHeight: 200,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: 52, height: 52, borderRadius: 12, margin: '0 auto 1rem',
            background: '#FEF0E8',
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
            padding: '0.45rem 1.1rem', borderRadius: 8, fontSize: '0.82rem',
            fontWeight: 700, marginBottom: 8,
          }}>Choose Files</div>
          <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>PDF · DOC · DOCX · PPTX · Multiple allowed</div>
        </div>
      )}
    </div>
  )
}

/* ── Custom Criteria Form ────────────────────────────────────────────────── */
const newCriterion = () => ({ id: Date.now() + Math.random(), question: '', maxMarks: 10, mandatory: false })
const newCategory  = () => ({ id: Date.now() + Math.random(), name: '', minimumRequired: 70, criteria: [newCriterion()] })

function CustomCriteriaForm({ value, onChange }) {
  const { threshold, categories } = value

  const set = next => onChange(next)

  const addCategory = () => set({ ...value, categories: [...categories, newCategory()] })

  const removeCategory = id =>
    set({ ...value, categories: categories.filter(c => c.id !== id) })

  const updateCat = (id, patch) =>
    set({ ...value, categories: categories.map(c => c.id === id ? { ...c, ...patch } : c) })

  const addCriterion = catId => {
    const cat = categories.find(c => c.id === catId)
    updateCat(catId, { criteria: [...cat.criteria, newCriterion()] })
  }

  const removeCriterion = (catId, critId) => {
    const cat = categories.find(c => c.id === catId)
    if (cat.criteria.length === 1) return
    updateCat(catId, { criteria: cat.criteria.filter(c => c.id !== critId) })
  }

  const updateCrit = (catId, critId, patch) => {
    const cat = categories.find(c => c.id === catId)
    updateCat(catId, { criteria: cat.criteria.map(c => c.id === critId ? { ...c, ...patch } : c) })
  }

  const totalMarks = categories.reduce(
    (sum, cat) => sum + cat.criteria.reduce((s, c) => s + (Number(c.maxMarks) || 0), 0), 0
  )

  const inputStyle = {
    padding: '0.4rem 0.625rem', border: '1px solid #E2E8F0', borderRadius: 6,
    fontSize: '0.82rem', color: '#1E293B', outline: 'none', background: '#fff',
  }

  return (
    <div>
      {/* Threshold bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '0.75rem 1rem', background: '#F8FAFC', borderRadius: 8,
        border: '1px solid #E2E8F0', marginBottom: '1.25rem',
      }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1E293B' }}>Pass Threshold</div>
          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Minimum score to pass</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="number" min="1" max="100" value={threshold}
            onChange={e => set({ ...value, threshold: Number(e.target.value) })}
            style={{ ...inputStyle, width: 58, textAlign: 'center', fontWeight: 700 }}
          />
          <span style={{ fontSize: '0.82rem', color: '#64748B' }}>%</span>
        </div>
        <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginLeft: 8 }}>
          Total marks: <strong style={{ color: '#4F46E5' }}>{totalMarks}</strong>
        </div>
      </div>

      {/* Categories */}
      {categories.map((cat, catIdx) => {
        const catMarks  = cat.criteria.reduce((s, c) => s + (Number(c.maxMarks) || 0), 0)
        const catWeight = totalMarks > 0 ? Math.round(catMarks / totalMarks * 100) : 0

        return (
          <div key={cat.id} style={{
            border: '1px solid #E2E8F0', borderRadius: 10,
            marginBottom: '0.875rem', overflow: 'hidden',
          }}>
            {/* Category header */}
            <div style={{
              background: '#F8FAFC', padding: '0.625rem 1rem',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 6, background: '#4F46E5', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.65rem', fontWeight: 800, flexShrink: 0,
              }}>{catIdx + 1}</div>

              <input
                placeholder="Category name (e.g. Technical Experience)"
                value={cat.name}
                onChange={e => updateCat(cat.id, { name: e.target.value })}
                style={{
                  flex: 1, border: 'none', background: 'transparent', outline: 'none',
                  fontSize: '0.82rem', fontWeight: 600, color: '#1E293B',
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Min</span>
                <input type="number" min="0" max="100" value={cat.minimumRequired}
                  onChange={e => updateCat(cat.id, { minimumRequired: Number(e.target.value) })}
                  style={{ ...inputStyle, width: 42, textAlign: 'center', padding: '2px 4px' }}
                />
                <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>%</span>
                <span style={{ fontSize: '0.68rem', color: '#4F46E5', fontWeight: 700, marginLeft: 6 }}>
                  {catMarks}pts · {catWeight}%
                </span>
              </div>

              {categories.length > 1 && (
                <button onClick={() => removeCategory(cat.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#CBD5E1', fontSize: '1.1rem', lineHeight: 1, padding: '2px 4px', flexShrink: 0,
                }}
                  onMouseEnter={e => e.target.style.color = '#EF4444'}
                  onMouseLeave={e => e.target.style.color = '#CBD5E1'}
                >×</button>
              )}
            </div>

            {/* Criteria rows */}
            <div style={{ padding: '0.75rem 1rem' }}>
              {cat.criteria.map((crit, critIdx) => (
                <div key={crit.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                }}>
                  <span style={{ fontSize: '0.68rem', color: '#CBD5E1', width: 14, textAlign: 'right', flexShrink: 0 }}>
                    {critIdx + 1}.
                  </span>
                  <input
                    placeholder={`Question or criterion ${critIdx + 1}…`}
                    value={crit.question}
                    onChange={e => updateCrit(cat.id, crit.id, { question: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}
                    onFocus={e => e.target.style.borderColor = '#818CF8'}
                    onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                  />
                  <input type="number" min="1" max="999" value={crit.maxMarks}
                    onChange={e => updateCrit(cat.id, crit.id, { maxMarks: Number(e.target.value) })}
                    style={{ ...inputStyle, width: 50, textAlign: 'center' }}
                    title="Max marks"
                  />
                  <span style={{ fontSize: '0.68rem', color: '#94A3B8', flexShrink: 0 }}>pts</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', flexShrink: 0 }}>
                    <input type="checkbox" checked={crit.mandatory}
                      onChange={e => updateCrit(cat.id, crit.id, { mandatory: e.target.checked })}
                      style={{ cursor: 'pointer', accentColor: '#DC2626' }}
                    />
                    <span style={{ fontSize: '0.68rem', color: '#64748B' }}>Must</span>
                  </label>
                  {cat.criteria.length > 1 && (
                    <button onClick={() => removeCriterion(cat.id, crit.id)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#CBD5E1', fontSize: '1rem', lineHeight: 1, padding: '2px', flexShrink: 0,
                    }}
                      onMouseEnter={e => e.target.style.color = '#EF4444'}
                      onMouseLeave={e => e.target.style.color = '#CBD5E1'}
                    >×</button>
                  )}
                </div>
              ))}

              <button onClick={() => addCriterion(cat.id)} style={{
                marginTop: 4, background: 'none', border: '1px dashed #CBD5E1',
                borderRadius: 6, padding: '0.3rem 0.75rem', cursor: 'pointer',
                color: '#94A3B8', fontSize: '0.75rem', fontWeight: 600, transition: 'all .15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#818CF8'; e.currentTarget.style.color = '#4F46E5' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#94A3B8' }}
              >+ Add Question</button>
            </div>
          </div>
        )
      })}

      <button onClick={addCategory} style={{
        width: '100%', padding: '0.6rem', border: '1.5px dashed #CBD5E1',
        borderRadius: 8, background: 'none', cursor: 'pointer',
        color: '#64748B', fontSize: '0.8rem', fontWeight: 600, transition: 'all .15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#818CF8'; e.currentTarget.style.color = '#4F46E5'; e.currentTarget.style.background = '#EEF2FF' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#64748B'; e.currentTarget.style.background = 'none' }}
      >+ Add Category</button>
    </div>
  )
}

function StepCard({ step, state }) {
  const isPending = state === 'pending'
  const isActive  = state === 'active'
  const isDone    = state === 'done'

  return (
    <div style={{
      borderRadius: 18,
      padding: '2rem 1.75rem',
      border: `2px solid ${isDone ? '#22C55E' : isActive ? '#F26522' : '#E2E8F0'}`,
      background: isDone
        ? 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)'
        : isActive
          ? 'linear-gradient(135deg, #FEF0E8 0%, #FDE8D8 100%)'
          : '#F8FAFC',
      boxShadow: isDone
        ? '0 4px 24px rgba(34,197,94,.15)'
        : isActive
          ? '0 4px 24px rgba(242,101,34,.2), 0 0 0 4px rgba(242,101,34,.08)'
          : '0 1px 4px rgba(0,0,0,.04)',
      transition: 'all .4s cubic-bezier(.34,1.56,.64,1)',
      animation: isActive ? 'cardIn .35s ease-out' : isDone ? 'cardDone .35s ease-out' : 'none',
      opacity: isPending ? 0.55 : 1,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem',
      minHeight: 200,
    }}>
      {/* Shimmer overlay on active */}
      {isActive && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,.5) 50%, transparent 60%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 2s linear infinite',
        }}/>
      )}

      {/* Top row: step number + status badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: isDone ? '#22C55E' : isActive ? '#F26522' : '#E2E8F0',
          color: isPending ? '#94A3B8' : '#fff',
          fontSize: '0.78rem', fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isActive ? '0 0 0 6px rgba(242,101,34,.2)' : 'none',
          animation: isActive ? 'pulseRing 1.6s ease-in-out infinite' : 'none',
          transition: 'all .3s',
        }}>
          {isDone
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            : step.id}
        </div>

        <span style={{
          fontSize: '0.7rem', fontWeight: 700, padding: '4px 12px', borderRadius: 999,
          background: isDone ? '#DCFCE7' : isActive ? '#FEF0E8' : '#F1F5F9',
          color: isDone ? '#15803D' : isActive ? '#D4541A' : '#94A3B8',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {isActive && (
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: '#F26522',
              animation: 'dotPulse .8s ease-in-out infinite alternate', display: 'inline-block',
            }}/>
          )}
          {isDone ? '✓ Done' : isActive ? 'Running…' : 'Pending'}
        </span>
      </div>

      {/* Icon */}
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: isDone ? '#DCFCE7' : isActive ? '#FDE8D8' : '#E2E8F0',
        color: isDone ? '#16A34A' : isActive ? '#F26522' : '#94A3B8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .3s',
        animation: isDone ? 'iconPop .4s cubic-bezier(.34,1.56,.64,1)' : 'none',
      }}>
        {step.icon}
      </div>

      {/* Label + sub */}
      <div>
        <div style={{
          fontWeight: 800, fontSize: '1rem',
          color: isDone ? '#15803D' : isActive ? '#D4541A' : '#94A3B8',
          marginBottom: 4, transition: 'color .3s',
        }}>{step.label}</div>
        <div style={{ fontSize: '0.8rem', color: isDone ? '#16A34A' : isActive ? '#F26522' : '#CBD5E1', lineHeight: 1.45 }}>
          {step.sub}
        </div>
      </div>

      {/* Active — animated progress bar at bottom */}
      {isActive && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: '#FEF0E8', borderRadius: '0 0 16px 16px' }}>
          <div style={{
            height: '100%', background: 'linear-gradient(90deg, #F26522, #F5823A)',
            borderRadius: '0 0 16px 16px',
            animation: 'progressBar 3s ease-in-out infinite',
          }}/>
        </div>
      )}
      {/* Done — solid green bar */}
      {isDone && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: '#22C55E', borderRadius: '0 0 16px 16px' }}/>
      )}
    </div>
  )
}

const DEFAULT_CUSTOM_CRITERIA = {
  threshold: 70,
  categories: [newCategory()],
}

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
        criteria: cat.criteria.map(c => ({
          question: c.question,
          max_marks: Number(c.maxMarks),
          mandatory: c.mandatory,
        })),
      }
    }),
  }
}

export default function EvaluatePage() {
  const [rfpFile, setRfpFile]     = useState(null)
  const [bidFiles, setBidFiles]   = useState([])
  const [prebidFile, setPrebidFile] = useState(null)
  const [customCriteria, setCustomCriteria] = useState(DEFAULT_CUSTOM_CRITERIA)
  const [phase, setPhase]         = useState('upload')   // upload | progress | no_rules | error
  const [stepStates, setStepStates] = useState(STEPS.map(() => 'pending'))
  const [error, setError]         = useState('')
  const { setReport, setRfpName, setBidName, addToHistory } = useEvaluation()
  const navigate = useNavigate()

  const advance = (idx, state) =>
    setStepStates(s => s.map((v, i) => (i === idx ? state : v)))

  const isCriteriaReady =
    customCriteria.categories.length > 0 &&
    customCriteria.categories.every(cat =>
      cat.name.trim() !== '' &&
      cat.criteria.length > 0 &&
      cat.criteria.every(c => c.question.trim() !== '' && Number(c.maxMarks) > 0)
    )

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
    addToHistory({
      id: Date.now(),
      rfpName,
      bidName,
      report,
      timestamp: new Date().toISOString(),
      score: Math.round((report.total_score / report.max_score) * 100),
      passed: report.passed,
    })
    setTimeout(() => navigate('/active-evaluation'), 500)
  }

  async function handleEvaluate() {
    setPhase('progress')
    setStepStates(STEPS.map(() => 'pending'))
    setError('')
    const timers = makeTimers()
    try {
      const report = await runEvaluation(rfpFile, bidFiles, prebidFile)
      timers.forEach(clearTimeout)
      await finishEvaluation(report, rfpFile.name)
    } catch (e) {
      timers.forEach(clearTimeout)
      if (e.message.includes('NO_RULES_FOUND')) {
        setPhase('no_rules')
      } else {
        setError(e.message)
        setPhase('error')
      }
    }
  }

  async function handleEvaluateCustom() {
    setPhase('progress')
    setStepStates(STEPS.map(() => 'pending'))
    setError('')
    const timers = makeTimers()
    try {
      const report = await runCustomEvaluation(bidFiles, buildCriteriaPayload(customCriteria))
      timers.forEach(clearTimeout)
      await finishEvaluation(report, rfpFile?.name ?? 'Custom Criteria')
    } catch (e) {
      timers.forEach(clearTimeout)
      setError(e.message)
      setPhase('no_rules')
    }
  }

  if (phase === 'progress') {
    const doneCount = stepStates.filter(s => s === 'done').length
    const progressPct = Math.round((doneCount / STEPS.length) * 100)

    return (
      <div className="page-content fade-in" style={{ maxWidth: 'none' }}>
        <style>{`
          @keyframes spin        { to { transform: rotate(360deg); } }
          @keyframes shimmer     { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
          @keyframes pulseRing   { 0%,100% { box-shadow: 0 0 0 0 rgba(242,101,34,.4); } 50% { box-shadow: 0 0 0 10px rgba(242,101,34,0); } }
          @keyframes dotPulse    { from { opacity: .4; transform: scale(.8); } to { opacity: 1; transform: scale(1.2); } }
          @keyframes cardIn      { from { opacity: 0; transform: translateY(12px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
          @keyframes cardDone    { 0% { transform: scale(1); } 40% { transform: scale(1.03); } 100% { transform: scale(1); } }
          @keyframes iconPop     { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
          @keyframes progressBar { 0% { width: 0%; } 60% { width: 85%; } 100% { width: 95%; } }
        `}</style>

        {/* Header */}
        <div style={{ marginBottom: '2.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827', marginBottom: 6 }}>
              Evaluation in Progress
            </h1>
            <p style={{ color: '#64748B', fontSize: '0.9rem', margin: 0 }}>
              AI pipeline analyzing your documents — this takes 30–90 seconds
            </p>
          </div>

          {/* Spinner + step counter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#FEF0E8', borderRadius: 12, padding: '0.75rem 1.25rem' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              border: '3px solid #FDE8D8', borderTop: '3px solid #F26522',
              animation: 'spin 1s linear infinite',
            }}/>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#D4541A' }}>
                Step {Math.min(doneCount + 1, STEPS.length)} of {STEPS.length}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#F26522' }}>Do not close this window</div>
            </div>
          </div>
        </div>

        {/* Overall progress bar */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748B' }}>Overall Progress</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#F26522' }}>{progressPct}%</span>
          </div>
          <div style={{ height: 8, background: '#E2E8F0', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 999,
              background: 'linear-gradient(90deg, #F26522, #F5823A)',
              width: `${progressPct}%`,
              transition: 'width .6s cubic-bezier(.34,1.56,.64,1)',
            }}/>
          </div>
        </div>

        {/* Step cards grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1.25rem',
        }}>
          {STEPS.map((s, i) => <StepCard key={s.id} step={s} state={stepStates[i]} />)}
        </div>
      </div>
    )
  }

  if (phase === 'no_rules') {
    return (
      <div className="page-content fade-in">
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 4 }}>Define Scoring Criteria</h1>
          <p style={{ color: '#64748B', margin: 0 }}>
            The RFP was uploaded successfully but contains no scoring rules.
            Define your own criteria below — the AI will evaluate the bid against them.
          </p>
        </div>

        {/* Uploaded files summary */}
        <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {rfpFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#FEF0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F26522" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
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
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>BID{bidFiles.length > 1 ? 'S' : ''}</div>
                <div style={{ fontSize: '0.8rem', color: '#1E293B', fontWeight: 600 }}>{bidFiles.map(f => f.name).join(', ')}</div>
              </div>
            </div>
          )}
          <button onClick={() => setPhase('upload')} style={{
            marginLeft: 'auto', background: 'none', border: '1px solid #E2E8F0',
            borderRadius: 6, padding: '0.35rem 0.75rem', cursor: 'pointer',
            fontSize: '0.75rem', color: '#64748B', fontWeight: 600,
          }}>← Change files</button>
        </div>

        {error && (
          <div style={{
            background: '#FFF1F2', border: '1px solid #FECDD3', borderLeft: '4px solid #EF4444',
            borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.5rem',
          }}>
            <div style={{ fontWeight: 700, color: '#BE123C', marginBottom: 4 }}>Evaluation Failed</div>
            <div style={{ fontSize: '0.875rem', color: '#9F1239' }}>{error}</div>
          </div>
        )}

        <div className="card" style={{ padding: '2rem' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1E293B', marginBottom: '0.5rem' }}>
            Scoring Criteria
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '1.25rem' }}>
            Add categories and questions. The AI will score the bid on each one.
          </div>
          <CustomCriteriaForm value={customCriteria} onChange={setCustomCriteria} />
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '1.5rem', textAlign: 'center', marginTop: '1.5rem' }}>
            <button
              className="btn btn-primary"
              style={{ padding: '0.75rem 2.5rem', fontSize: '1rem' }}
              disabled={!isCriteriaReady}
              onClick={handleEvaluateCustom}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              Run Evaluation
            </button>
            <p style={{ marginTop: 10, fontSize: '0.78rem', color: '#94A3B8' }}>
              Powered by Groq LLaMA — results in 30–90 seconds
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-content">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 4 }}>New Evaluation</h1>
        <p style={{ color: '#64748B' }}>Upload the RFP and vendor bid to start AI-powered scoring</p>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left column — upload + run */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" style={{ padding: '2rem' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '1.25rem', color: '#1E293B' }}>
              Upload Documents
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.25rem', alignItems: 'stretch', minHeight: 200 }}>
              <UploadZone
                label="RFP / Tender Document"
                sub="Contains evaluation criteria and scoring rules"
                file={rfpFile} onFile={setRfpFile} accent="#F26522"
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
                files={bidFiles} onFiles={setBidFiles} accent="#F5823A"
              />
            </div>

            {/* Optional Pre-Bid Q&A upload */}
            <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
                <span style={{
                  background: '#F1F5F9', borderRadius: 4, padding: '1px 7px',
                  fontSize: '0.65rem', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.04em',
                }}>OPTIONAL</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Additional Information</span>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>— Pre-Bid Q&amp;A or clarification documents</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <UploadZone
                    label="Pre-Bid Q&A / Clarifications"
                    sub="Official Q&A amendments to the RFP (PDF, DOCX)"
                    file={prebidFile}
                    onFile={setPrebidFile}
                    accent="#F26522"
                  />
                </div>
                {prebidFile && (
                  <button
                    onClick={() => setPrebidFile(null)}
                    style={{
                      marginTop: 6, padding: '4px 10px', border: '1px solid #E2E8F0',
                      borderRadius: 6, background: '#fff', cursor: 'pointer',
                      fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600,
                    }}
                  >✕ Remove</button>
                )}
              </div>
            </div>

            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '1.5rem', textAlign: 'center' }}>
              <button
                className="btn btn-primary"
                style={{ padding: '0.75rem 2.5rem', fontSize: '1rem' }}
                disabled={!rfpFile || bidFiles.length === 0}
                onClick={handleEvaluate}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Run Evaluation
              </button>
              <p style={{ marginTop: 10, fontSize: '0.78rem', color: '#94A3B8' }}>
                Powered by Groq LLaMA — results in 30–90 seconds
              </p>
            </div>
          </div>

          {/* Upload status summary */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.875rem', color: '#1E293B' }}>
              Upload Status
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* RFP row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '0.7rem 1rem', borderRadius: 8,
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

              {/* Bid files rows */}
              {bidFiles.length === 0 ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '0.7rem 1rem', borderRadius: 8,
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
                  <div style={{ flex: 1, minWidth: 0 }}>
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
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '0.7rem 1rem', borderRadius: 8,
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
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>Vendor Bid {bidFiles.length > 1 ? `#${i + 1}` : 'Document'}</div>
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

              {/* Pre-Bid Q&A row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '0.7rem 1rem', borderRadius: 8,
                background: prebidFile ? '#F5F3FF' : '#F8FAFC',
                border: `1px solid ${prebidFile ? '#DDD6FE' : '#E2E8F0'}`,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: prebidFile ? '#EDE9FE' : '#E2E8F0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke={prebidFile ? '#7C3AED' : '#94A3B8'} strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>
                    Pre-Bid Q&A
                    {!prebidFile && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700 }}>OPTIONAL</span>}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: prebidFile ? '#7C3AED' : '#94A3B8',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {prebidFile ? prebidFile.name : 'Not uploaded'}
                  </div>
                </div>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                  background: prebidFile ? '#EDE9FE' : '#F1F5F9',
                  color: prebidFile ? '#5B21B6' : '#94A3B8',
                }}>{prebidFile ? 'Ready' : 'Skipped'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column — how it works + tips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '1.25rem', color: '#1E293B' }}>How it works</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                { n: '01', t: 'Upload Documents',  d: 'Upload the RFP and vendor bid in PDF or Word format', color: '#F26522' },
                { n: '02', t: 'AI Extracts Rules', d: 'AI reads the RFP and extracts all scoring criteria and weights', color: '#F5823A' },
                { n: '03', t: 'Get Results',       d: 'Receive detailed scores, gap analysis, and PASS/FAIL verdict', color: '#22C55E' },
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
            <div style={{ fontWeight: 700, marginBottom: '1rem', color: '#1E293B' }}>Tips for best results</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { icon: '📄', tip: 'Use text-based PDFs rather than scanned images for faster extraction.' },
                { icon: '✅', tip: 'Ensure the RFP clearly lists scoring criteria and weightings.' },
                { icon: '📋', tip: 'The vendor bid should directly address all requirements in the RFP.' },
                { icon: '⚡', tip: 'Files under 10 MB process significantly faster.' },
              ].map(({ icon, tip }) => (
                <div key={tip} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.9rem', flexShrink: 0, marginTop: 1 }}>{icon}</span>
                  <span style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: 1.5 }}>{tip}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{
            padding: '1.25rem', background: 'linear-gradient(135deg, #FEF0E8 0%, #FDE8D8 100%)',
            border: '1px solid #FDE8D8',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F26522" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#D4541A' }}>AI Confidence</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#D4541A', margin: 0, lineHeight: 1.5 }}>
              Our AI pipeline typically achieves <strong>90–97% confidence</strong> on well-structured RFP documents with clear scoring criteria.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
