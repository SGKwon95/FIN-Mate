-- RAG 응답 캐시 테이블
CREATE TABLE "rag_cache" (
    "cache_id"    UUID          NOT NULL DEFAULT gen_random_uuid(),
    "cache_key"   VARCHAR(64)   NOT NULL,
    "question"    TEXT          NOT NULL,
    "doc_scope"   TEXT          NOT NULL DEFAULT '',
    "answer"      TEXT          NOT NULL,
    "chunk_ids"   UUID[]        NOT NULL DEFAULT '{}',
    "embedding"   vector(768),
    "hit_count"   INT           NOT NULL DEFAULT 0,
    "created_at"  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    "last_hit_at" TIMESTAMPTZ,
    CONSTRAINT "rag_cache_pkey" PRIMARY KEY ("cache_id")
);

CREATE UNIQUE INDEX "rag_cache_key_idx"
    ON "rag_cache" ("cache_key");

CREATE INDEX "rag_cache_embedding_idx"
    ON "rag_cache"
    USING ivfflat ("embedding" vector_cosine_ops)
    WITH (lists = 50);
