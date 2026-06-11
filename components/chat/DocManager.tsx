'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Upload, Trash2, FileText, Loader2, X, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

type DocEntry = {
  documentId: string
  originalName: string
  documentType: string
  uploadedAt: string
}

type DocContent = {
  originalName: string
  content: string
  downloadUrl: string | null
}

type Category = 'banking' | 'product'

const SECTIONS: { key: Category; label: string }[] = [
  { key: 'banking', label: '은행업무 문서' },
  { key: 'product', label: '상품 문서' },
]

export default function DocManager() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.isAdmin === true
  const [docs, setDocs] = useState<DocEntry[]>([])
  const [uploading, setUploading] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [preview, setPreview] = useState<DocContent | null>(null)
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null)
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

  async function handlePreview(documentId: string) {
    setLoadingPreview(documentId)
    try {
      const res = await fetch(`/api/employee/documents/${documentId}`)
      if (res.ok) setPreview(await res.json())
    } finally {
      setLoadingPreview(null)
    }
  }

  return (
    <>
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
                      <button
                        onClick={() => handlePreview(doc.documentId)}
                        disabled={loadingPreview === doc.documentId}
                        className="flex-1 text-sm text-kb-navy truncate text-left hover:text-kb-navy/70 transition-colors disabled:opacity-50"
                      >
                        {loadingPreview === doc.documentId
                          ? <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin inline" /> 불러오는 중…</span>
                          : doc.originalName
                        }
                      </button>
                      <span className="text-xs text-kb-gray shrink-0">
                        {new Date(doc.uploadedAt).toLocaleDateString('ko-KR')}
                      </span>
                      {isAdmin && (
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
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {/* 문서 미리보기 모달 */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80dvh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-kb-gray-border shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-kb-navy shrink-0" />
                <p className="text-sm font-semibold text-kb-navy truncate">{preview.originalName}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                {preview.downloadUrl && (
                  <a
                    href={preview.downloadUrl}
                    download={preview.originalName}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-kb-navy text-white hover:bg-kb-navy/90 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    원본 다운로드
                  </a>
                )}
                <button
                  onClick={() => setPreview(null)}
                  className="p-1 text-kb-gray hover:text-kb-navy transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 본문 */}
            <div className="flex-1 overflow-y-auto scrollbar-none px-5 py-4">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                {preview.content}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
