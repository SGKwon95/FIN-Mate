'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2, FileText, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type DocEntry = {
  documentId: string
  originalName: string
  documentType: string
  uploadedAt: string
}

type Category = 'banking' | 'product'

const SECTIONS: { key: Category; label: string }[] = [
  { key: 'banking', label: '은행업무 문서' },
  { key: 'product', label: '상품 문서' },
]

export default function DocManager() {
  const [docs, setDocs] = useState<DocEntry[]>([])
  const [uploading, setUploading] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const bankingRef = useRef<HTMLInputElement>(null)
  const productRef  = useRef<HTMLInputElement>(null)

  async function loadDocs() {
    const res = await fetch('/api/employee/documents')
    if (res.ok) setDocs(await res.json())
  }

  useEffect(() => { loadDocs() }, [])

  async function handleUpload(category: Category, file: File) {
    setUploading(category)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('category', category)
      const res = await fetch('/api/employee/documents', { method: 'POST', body: form })
      if (!res.ok) {
        const { error } = await res.json()
        alert(error ?? '업로드 실패')
        return
      }
      await loadDocs()
    } finally {
      setUploading(null)
    }
  }

  async function handleDelete(documentId: string) {
    setDeleting(documentId)
    try {
      await fetch(`/api/employee/documents/${documentId}`, { method: 'DELETE' })
      setDocs(prev => prev.filter(d => d.documentId !== documentId))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-none px-4 py-5 space-y-6">
      {SECTIONS.map(({ key, label }) => {
        const ref = key === 'banking' ? bankingRef : productRef
        const sectionDocs = docs.filter(d => d.documentType === key)

        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-kb-navy">{label}</h3>
              <button
                onClick={() => ref.current?.click()}
                disabled={uploading === key}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  uploading === key
                    ? 'bg-kb-gray-light text-kb-gray cursor-not-allowed'
                    : 'bg-kb-navy text-white hover:bg-kb-navy/90',
                )}
              >
                {uploading === key
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Upload className="w-3.5 h-3.5" />
                }
                {uploading === key ? '처리 중…' : '업로드'}
              </button>
              <input
                ref={ref}
                type="file"
                accept=".txt,.md,.html,.htm,.pdf"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleUpload(key, file)
                  e.target.value = ''
                }}
              />
            </div>

            {sectionDocs.length === 0 ? (
              <p className="text-xs text-kb-gray text-center py-4 border border-dashed border-kb-gray-border rounded-xl">
                업로드된 문서가 없습니다
              </p>
            ) : (
              <ul className="space-y-2">
                {sectionDocs.map(doc => (
                  <li
                    key={doc.documentId}
                    className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border border-kb-gray-border shadow-card"
                  >
                    <FileText className="w-4 h-4 text-kb-gray shrink-0" />
                    <span className="flex-1 text-sm text-kb-navy truncate">{doc.originalName}</span>
                    <span className="text-xs text-kb-gray shrink-0">
                      {new Date(doc.uploadedAt).toLocaleDateString('ko-KR')}
                    </span>
                    <button
                      onClick={() => handleDelete(doc.documentId)}
                      disabled={deleting === doc.documentId}
                      className="p-1 text-kb-gray hover:text-red-500 transition-colors disabled:opacity-40"
                    >
                      {deleting === doc.documentId
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />
                      }
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
