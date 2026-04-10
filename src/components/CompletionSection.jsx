import { useState, useEffect, useRef } from 'react';
import { completions, attachments as attachApi } from '../api';
import { Upload, Check, RotateCcw, X, FileText, Trash2, Plus } from 'lucide-react';

const C = {
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', bg: 'var(--cbrio-bg)',
  green: '#10b981', red: '#ef4444', primary: '#7c3aed',
};

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function CompletionSection({ task, phase, eventName, isPMO, onComplete }) {
  const [existing, setExisting] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [showReopen, setShowReopen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [addingFiles, setAddingFiles] = useState(false);
  const fileRef = useRef(null);
  const addFileRef = useRef(null);

  const reload = () => {
    if (task?.id) completions.getByTask(task.id).then(setExisting).catch(() => setExisting(null));
  };

  useEffect(() => { reload(); }, [task?.id]);

  const isDone = task.status === 'concluida';
  const phaseFolderName = phase ? `Fase ${String(phase.numero_fase).padStart(2, '0')} - ${phase.nome_fase}` : '';

  const addFilesFromInput = (e) => {
    const newFiles = Array.from(e.target.files || []).map(f => ({
      file: f, progress: 0, uploaded: false, result: null,
    }));
    setFiles(prev => [...prev, ...newFiles]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const addFilesFromDrop = (fileList) => {
    const newFiles = Array.from(fileList).map(f => ({
      file: f, progress: 0, uploaded: false, result: null,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  // ── Drag & Drop handlers ──
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
    if (e.dataTransfer.files?.length > 0) addFilesFromDrop(e.dataTransfer.files);
  };

  // ── Upload para SharePoint (chunks de 10MB) ──
  const CHUNK_SIZE = 10 * 1024 * 1024;

  const uploadToSharePoint = async (fileObj, idx, progressSetter) => {
    const { uploadUrl, sharepointPath } = await completions.getUploadUrl({
      fileName: fileObj.name,
      eventName: eventName || '',
      phaseName: phaseFolderName,
      area: task.area || '',
    });

    let uploadData;
    if (fileObj.size <= CHUNK_SIZE) {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Length': fileObj.size, 'Content-Range': `bytes 0-${fileObj.size - 1}/${fileObj.size}` },
        body: fileObj,
      });
      if (!res.ok) {
        let errMsg = `SharePoint retornou ${res.status}`;
        try { const ed = await res.json(); errMsg = ed.error?.message || ed.error || errMsg; } catch {}
        throw new Error(errMsg);
      }
      uploadData = await res.json();
      progressSetter(idx, 100);
    } else {
      let offset = 0;
      while (offset < fileObj.size) {
        const end = Math.min(offset + CHUNK_SIZE, fileObj.size);
        const chunk = fileObj.slice(offset, end);
        const isLast = end === fileObj.size;
        const res = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Length': end - offset, 'Content-Range': `bytes ${offset}-${end - 1}/${fileObj.size}` },
          body: chunk,
        });
        if (isLast) {
          if (!res.ok) { let m = `SharePoint ${res.status}`; try { const e = await res.json(); m = e.error?.message || m; } catch {} throw new Error(m); }
          uploadData = await res.json();
        } else if (res.status !== 202 && !res.ok) {
          throw new Error(`Chunk falhou (${res.status})`);
        }
        offset = end;
        progressSetter(idx, Math.round((offset / fileObj.size) * 100));
      }
    }

    return {
      file_name: fileObj.name, file_url: uploadData.webUrl || '',
      sharepoint_path: sharepointPath, sharepoint_item_id: uploadData.id || null,
      mime_type: fileObj.type, size: fileObj.size,
    };
  };

  const uploadFilesToSharePoint = async () => {
    const uploaded = [];
    const setProg = (i, pct) => setFiles(prev => prev.map((pf, pi) => pi === i ? { ...pf, progress: pct } : pf));
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.uploaded && f.result) { uploaded.push(f.result); continue; }
      try {
        const result = await uploadToSharePoint(f.file, i, setProg);
        setFiles(prev => prev.map((pf, pi) => pi === i ? { ...pf, progress: 100, uploaded: true, result } : pf));
        uploaded.push(result);
      } catch (err) {
        setFiles(prev => prev.map((pf, pi) => pi === i ? { ...pf, progress: -1 } : pf));
        throw new Error(`Falha ao enviar ${f.file.name}: ${err.message}`);
      }
    }
    return uploaded;
  };

  // ── Concluir tarefa ──
  const handleComplete = async () => {
    setSubmitting(true); setError('');
    try {
      let uploadedFiles = [];
      if (files.length > 0) uploadedFiles = await uploadFilesToSharePoint();
      const result = await completions.complete({
        task_id: task.id, event_id: task.event_id, event_phase_id: task.event_phase_id || '',
        phase_number: phase?.numero_fase || 0, phase_name: phase?.nome_fase || '',
        area: task.area || '', observacao: observacao.trim() || null, files: uploadedFiles,
      });
      if (result.error) throw new Error(result.error);
      setShowForm(false); setObservacao(''); setFiles([]);
      if (onComplete) onComplete();
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  // ── Reabrir ──
  const handleReopen = async () => {
    setSubmitting(true);
    try {
      await completions.reopen(task.id, reopenReason);
      setShowReopen(false); setReopenReason(''); setExisting(null);
      if (onComplete) onComplete();
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  // ── Excluir arquivo ──
  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('Excluir este arquivo?')) return;
    try {
      await attachApi.remove(fileId);
      reload();
    } catch (e) { setError(e.message); }
  };

  // ── Adicionar arquivo(s) a tarefa já concluída ──
  const handleAddFilesToCompleted = async (fileList) => {
    setAddingFiles(true); setError('');
    try {
      const uploadedFiles = [];
      const filesToUpload = Array.from(fileList);
      for (const f of filesToUpload) {
        const result = await uploadToSharePoint(f, 0, () => {});
        uploadedFiles.push(result);
      }
      await completions.attach({
        task_id: task.id, event_id: task.event_id,
        phase_name: phase?.nome_fase || '', area: task.area || '',
        files: uploadedFiles,
      });
      reload();
      if (addFileRef.current) addFileRef.current.value = '';
    } catch (e) { setError(e.message); }
    finally { setAddingFiles(false); }
  };

  // ── Drop zone (compartilhado entre form e completed) ──
  const DropZone = ({ children, onFiles }) => (
    <div
      onDragOver={handleDragOver} onDragLeave={handleDragLeave}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); if (onFiles) onFiles(e.dataTransfer.files); else addFilesFromDrop(e.dataTransfer.files); }}
      style={{
        padding: '8px 14px', borderRadius: 6, cursor: 'pointer', width: '100%',
        border: `1px dashed ${dragging ? C.primary : C.border}`,
        background: dragging ? `${C.primary}08` : 'transparent',
        transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        fontSize: 12, color: C.t2,
      }}
    >
      {children}
    </div>
  );

  // ══════════════════════════════════════════════════════
  // ── Card já concluído ──
  // ══════════════════════════════════════════════════════
  if (isDone && existing) {
    return (
      <div style={{ border: `1px solid ${C.green}30`, borderRadius: 10, overflow: 'hidden' }}>
        {error && (
          <div style={{ padding: '8px 12px', background: '#fee2e2', color: C.red, fontSize: 11 }}>
            {error}
            <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: C.red }}>✕</button>
          </div>
        )}
        <div style={{ padding: '12px 16px', background: `${C.green}08`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Check style={{ width: 16, height: 16, color: C.green }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>Concluído</span>
          <span style={{ fontSize: 11, color: C.t3, marginLeft: 'auto' }}>
            {existing.completed_by_name || '—'} · {new Date(existing.completed_at).toLocaleDateString('pt-BR')}
          </span>
        </div>
        {existing.observacao && (
          <div style={{ padding: '10px 16px', fontSize: 12, color: C.t2, borderTop: `1px solid ${C.border}`, fontStyle: 'italic' }}>
            "{existing.observacao}"
          </div>
        )}
        {/* Lista de arquivos com opção de excluir */}
        {existing.files && existing.files.length > 0 && (
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            {existing.files.map((f, i) => (
              <div key={f.id || i} style={{ padding: '6px 16px', fontSize: 12, color: C.text, display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${C.border}` }}>
                <FileText style={{ width: 14, height: 14, color: C.t3 }} />
                <span style={{ flex: 1 }}>{f.file_name}</span>
                <span style={{ fontSize: 10, color: C.t3 }}>{formatSize(f.file_size)}</span>
                {f.sharepoint_url && (
                  <a href={f.sharepoint_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: C.primary }}>Abrir</a>
                )}
                {f.id && (
                  <button onClick={() => handleDeleteFile(f.id)} title="Excluir arquivo"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, padding: 0 }}>
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {/* Backward compat: arquivo único no card_completions */}
        {existing.file_name && (!existing.files || existing.files.length === 0) && (
          <div style={{ padding: '8px 16px', fontSize: 12, color: C.text, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText style={{ width: 14, height: 14, color: C.t3 }} /> {existing.file_name}
            {(existing.file_signed_url || existing.file_url) && (
              <a href={existing.file_signed_url || existing.file_url} target="_blank" rel="noopener noreferrer" style={{ color: C.primary, fontSize: 11 }}>Abrir</a>
            )}
          </div>
        )}
        {/* Adicionar mais arquivos (drag & drop ou botão) */}
        <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}` }}>
          <input ref={addFileRef} type="file" multiple onChange={(e) => handleAddFilesToCompleted(e.target.files)} style={{ display: 'none' }} />
          <DropZone onFiles={(fl) => handleAddFilesToCompleted(fl)}>
            {addingFiles ? (
              <span style={{ color: C.primary, fontWeight: 600 }}>Enviando...</span>
            ) : (
              <><Plus style={{ width: 14, height: 14 }} /> Adicionar entregável (ou arraste aqui)</>
            )}
          </DropZone>
        </div>
        {/* PMO reabrir */}
        {isPMO && (
          <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}` }}>
            {!showReopen ? (
              <button onClick={() => setShowReopen(true)} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 6,
                border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', fontSize: 11, color: C.t3,
              }}>
                <RotateCcw style={{ width: 12, height: 12 }} /> Reabrir
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input type="text" placeholder="Motivo da reabertura..." value={reopenReason}
                  onChange={e => setReopenReason(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: 'var(--cbrio-input-bg, #fff)' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setShowReopen(false)} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', fontSize: 11 }}>Cancelar</button>
                  <button onClick={handleReopen} disabled={submitting} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: C.red, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                    {submitting ? 'Reabrindo...' : 'Confirmar reabertura'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // ── Card não concluído ──
  // ══════════════════════════════════════════════════════
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
      {error && (
        <div style={{ padding: '8px 12px', background: '#fee2e2', color: C.red, fontSize: 11 }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: C.red }}>✕</button>
        </div>
      )}

      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={{
          width: '100%', padding: '12px 16px', border: 'none', cursor: 'pointer',
          background: `${C.green}08`, color: C.green, fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'background 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = `${C.green}18`}
          onMouseLeave={e => e.currentTarget.style.background = `${C.green}08`}>
          <Check style={{ width: 16, height: 16 }} /> Concluir tarefa
        </button>
      ) : (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Registrar conclusão</div>

          {/* Observação */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.t2, display: 'block', marginBottom: 4 }}>
              Observação <span style={{ fontWeight: 400, color: '#ef4444' }}>(obrigatório)</span>
            </label>
            <textarea rows={2} value={observacao} onChange={e => setObservacao(e.target.value)}
              placeholder="Como foi feito, resultado obtido, imprevisto..."
              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, resize: 'vertical', boxSizing: 'border-box', background: 'var(--cbrio-input-bg, #fff)' }} />
          </div>

          {/* Arquivos — botão + drag & drop */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.t2, display: 'block', marginBottom: 4 }}>
              Entregáveis <span style={{ fontWeight: 400 }}>(opcional — múltiplos arquivos)</span>
            </label>
            <input ref={fileRef} type="file" multiple onChange={addFilesFromInput} style={{ display: 'none' }} />
            <DropZone>
              <button onClick={() => fileRef.current?.click()}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t2, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Upload style={{ width: 14, height: 14 }} /> Adicionar arquivos ou arraste aqui
              </button>
            </DropZone>

            {/* Lista de arquivos selecionados */}
            {files.length > 0 && (
              <div style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                {files.map((f, i) => (
                  <div key={i} style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                    <FileText style={{ width: 14, height: 14, color: C.t3, flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.text }}>{f.file.name}</span>
                    <span style={{ fontSize: 10, color: C.t3, flexShrink: 0 }}>{formatSize(f.file.size)}</span>
                    {f.uploaded && <Check style={{ width: 14, height: 14, color: C.green, flexShrink: 0 }} />}
                    {!f.uploaded && f.progress > 0 && f.progress < 100 && (
                      <span style={{ fontSize: 10, color: C.primary, fontWeight: 600, flexShrink: 0 }}>{f.progress}%</span>
                    )}
                    {f.progress === -1 && <span style={{ fontSize: 10, color: C.red }}>Erro</span>}
                    {!f.uploaded && f.progress === 0 && (
                      <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.t3, padding: 0 }}>
                        <X style={{ width: 14, height: 14 }} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>
              Sem limite de tamanho · Qualquer tipo de arquivo · Enviado direto para o SharePoint
            </div>
          </div>

          {/* Ações */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowForm(false); setObservacao(''); setFiles([]); }}
              style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', fontSize: 12, color: C.t2 }}>
              Cancelar
            </button>
            <button onClick={handleComplete} disabled={submitting || !observacao.trim()}
              style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: C.green, color: '#fff', cursor: submitting || !observacao.trim() ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, opacity: !observacao.trim() ? 0.5 : 1 }}>
              {submitting ? (files.length > 0 ? 'Enviando arquivos...' : 'Registrando...') : '✓ Marcar como concluído'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
