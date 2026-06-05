-- pgvector 확장 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- 문서 청크 테이블 (RAG 벡터 저장소)
CREATE TABLE "document_chunks" (
    "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
    "doc_name"      TEXT        NOT NULL,
    "article_num"   TEXT,
    "section_num"   TEXT,
    "content"       TEXT        NOT NULL,
    "metadata"      JSONB       NOT NULL DEFAULT '{}',
    "embedding"     vector(768),
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- 코사인 유사도 IVFFlat 인덱스 (청크 수 < 10만 기준 lists=100)
CREATE INDEX "document_chunks_embedding_idx"
    ON "document_chunks"
    USING ivfflat ("embedding" vector_cosine_ops)
    WITH (lists = 100);

-- doc_name 필터 검색용 B-tree 인덱스
CREATE INDEX "document_chunks_doc_name_idx"
    ON "document_chunks" ("doc_name");
