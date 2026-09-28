# Chapter 14 — File, Document, Media, and RAG Architecture

## Uploads, Extraction, OCR, Page Workers, Search, Embeddings, Retrieval, Citations, and Secure Agent Access

# 14.1 Purpose

The platform needs a unified file and document system for:

* Personal files

* Family documents

* Couple documents

* Community-page files

* Event documents

* Images

* PDFs

* Office documents

* Audio

* Video

* Scanned documents

* Agent-generated reports

* Shared media

* RAG knowledge sources

The file system must support:

1. Secure upload

2. Virus and malware scanning

3. File validation

4. Metadata extraction

5. Text extraction

6. OCR

7. Page-level processing

8. Chunking

9. Embedding generation

10. Vector search

11. Keyword search

12. Permission-aware retrieval

13. Citations

14. Versioning

15. Deletion

16. Retention policies

17. Agent access through controlled tools

The system should separate file storage from document intelligence.

# 14.2 High-Level Architecture

```
Android / Web Client
        ↓
Upload API
        ↓
Authorization Check
        ↓
Upload Session
        ↓
Object Storage
        ↓
File Ingestion Queue
        ↓
File Validation
        ↓
Malware Scan
        ↓
Metadata Extraction
        ↓
Document Classification
        ↓
Page Extraction / OCR
        ↓
Text Normalization
        ↓
Chunking
        ↓
Embedding Generation
        ↓
Search Index
        ↓
Permission-Aware Retrieval
        ↓
Agent / User Answer
```

# 14.3 File Storage Design

## 14.3.1 Object Storage

Use S3-compatible object storage for:

* Original files

* Page images

* OCR artifacts

* Extracted text

* Generated previews

* Audio transcripts

* Video transcripts

* Agent-generated reports

* Export packages

Possible providers:

* Self-hosted MinIO

* Cloud object storage

* S3-compatible infrastructure

The application database should store metadata and references, not large binary files.

## 14.3.2 Object Key Design

Do not use user-controlled filenames directly as object keys.

Example:

```
tenant/{tenant_id}/
  files/{file_id}/
    original
    preview
    extracted/text.json
    pages/000001.json
    pages/000001.png
    embeddings/version-1
```

Use generated IDs:

```
file_id = file_01J...
object_key = tenant_123/files/file_01J.../original
```

## 14.3.3 File Metadata

```
file_id
owner_type
owner_id
uploaded_by_user_id
space_id
conversation_id
original_filename
safe_filename
mime_type
size_bytes
checksum_sha256
storage_key
status
classification
encryption_key_reference
created_at
updated_at
deleted_at
```

Possible statuses:

```
created
uploading
uploaded
scanning
processing
ready
partially_processed
failed
quarantined
deleted
```

# 14.4 Upload Workflow

## 14.4.1 Create Upload Session

http

```
POST /v1/files/upload-sessions
```

Request:

JSON

```
{
  "filename": "family_budget.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 2450000,
  "space_id": "family_group_45"
}
```

The API must validate:

* User authorization

* Space membership

* File size

* MIME type

* File count limits

* Storage quota

* Filename length

* Upload purpose

## 14.4.2 Upload to Object Storage

Use a short-lived presigned upload URL.

```
Client
  ↓
Upload API
  ↓
Presigned URL
  ↓
Object Storage
```

The client should not receive permanent storage credentials.

## 14.4.3 Complete Upload

http

```
POST /v1/files/{file_id}/complete
```

The server verifies:

* Object exists

* Actual size

* Content checksum

* File ownership

* Upload session validity

* MIME type based on file signature

Never trust only the client-provided MIME type.

# 14.5 File Validation

## 14.5.1 Validation Layers

```
Filename validation
    ↓
Size validation
    ↓
MIME validation
    ↓
Magic-byte validation
    ↓
Archive inspection
    ↓
Malware scanning
    ↓
Content policy scanning
```

## 14.5.2 Dangerous File Types

Special handling is required for:

* Executable files

* Macro-enabled documents

* Archives

* Embedded scripts

* HTML files

* SVG files

* Unknown binary formats

* Password-protected files

* Files containing external links

The platform may allow storage while preventing preview or processing until approved.

## 14.5.3 Archive Protection

For ZIP and similar files, enforce:

* Maximum compressed size

* Maximum decompressed size

* Maximum file count

* Maximum nesting depth

* Maximum filename length

* Duplicate path detection

* Symlink rejection

This prevents archive-bomb attacks.

# 14.6 Malware Scanning

Use a separate scanning worker.

```
Uploaded file
    ↓
Quarantine bucket
    ↓
Malware scanner
    ↓
Clean → Processing bucket
    ↓
Threat → Quarantine
```

Possible scanning technology:

* ClamAV

* Provider malware scanning

* Isolated sandbox scanner

* Enterprise security scanning service

The file must not become available to agents before scanning completes.

# 14.7 Document Processing Pipeline

## 14.7.1 Pipeline Stages

```
1. Detect file type
2. Extract metadata
3. Determine page count
4. Extract native text
5. Detect text quality
6. Run OCR if required
7. Extract tables and structure
8. Normalize text
9. Split into pages
10. Create chunks
11. Generate embeddings
12. Build indexes
13. Mark document ready
```

Each stage should be independently retryable.

## 14.7.2 Processing Job

JSON

```
{
  "job_id": "job_123",
  "file_id": "file_456",
  "operation": "document_ingestion",
  "priority": "normal",
  "attempt": 1,
  "status": "queued"
}
```

Use separate queues for:

* Small files

* Large PDFs

* OCR

* Image processing

* Audio transcription

* Video processing

* Embeddings

* Index updates

# 14.8 PDF Processing

The PDF worker should support page-level processing.

```
PDF
 ├── Page 1 job
 ├── Page 2 job
 ├── Page 3 job
 ├── Page 4 job
 └── Page N job
```

## 14.8.1 Page Job

JSON

```
{
  "page_job_id": "page_job_001",
  "file_id": "file_456",
  "page_number": 1,
  "operation": "extract_text",
  "priority": "normal",
  "attempt": 0
}
```

## 14.8.2 Worker Responsibilities

Each worker should:

1. Load the required page.

2. Extract native text.

3. Detect whether text is usable.

4. Run OCR if needed.

5. Extract page metadata.

6. Normalize text.

7. Save page result.

8. Emit completion event.

9. Acknowledge the queue job.

Workers should not load the entire multi-hundred-page document into memory when page-level processing is possible.

## 14.8.3 Ordering

Workers may finish out of order.

Use an order-aware collector:

```
Page 3 completed
Page 1 completed
Page 2 completed
Page 5 completed
Page 4 completed
        ↓
Collector sorts by page_number
        ↓
Final document ordered
```

The database should enforce uniqueness:

```
UNIQUE(file_id, page_number, extraction_version)
```

# 14.9 Recommended Open-Source Extraction Tools

|
File type

|

Tools

|
| --- | --- |
|

PDF native text

|

PyMuPDF, pypdf

|
|

PDF layout

|

PyMuPDF, pdfplumber

|
|

PDF tables

|

Camelot, Tabula-compatible tools

|
|

OCR

|

Tesseract, OCRmyPDF

|
|

Office documents

|

python-docx, python-pptx, openpyxl

|
|

HTML

|

BeautifulSoup, lxml

|
|

Markdown

|

Markdown parser

|
|

Images

|

Pillow

|
|

Audio

|

FFmpeg + approved transcription engine

|
|

Video

|

FFmpeg + transcription engine

|
|

Metadata

|

file-type detection library, custom parsers

|

Use a fallback chain:

```
Native extraction
    ↓
Quality check
    ↓
Layout extraction
    ↓
OCR
    ↓
Manual review or partial result
```

Do not run OCR on every PDF automatically. Native text extraction is generally cheaper and faster when usable.

# 14.10 OCR Architecture

## 14.10.1 OCR Decision

Run OCR when:

* Native text is empty

* Native text is too short

* Text extraction quality is poor

* The document is image-only

* The page is a scan

* The user explicitly requests OCR

## 14.10.2 OCR Output

JSON

```
{
  "file_id": "file_456",
  "page_number": 2,
  "text": "Extracted OCR text",
  "confidence": 0.87,
  "language": "eng",
  "blocks": [
    {
      "text": "Event budget",
      "x": 100,
      "y": 120,
      "width": 250,
      "height": 40,
      "confidence": 0.94
    }
  ]
}
```

OCR confidence should be used to determine whether the content requires review.

## 14.10.3 OCR Limitations

OCR may fail on:

* Handwriting

* Blurry images

* Rotated pages

* Complex tables

* Mixed languages

* Low contrast

* Decorative fonts

* Overlapping text

The system must mark uncertain extraction rather than silently treating it as exact.

# 14.11 Text Normalization

Normalization should preserve document meaning.

Operations may include:

* Unicode normalization

* Whitespace cleanup

* Line-break repair

* Hyphenation repair

* Header/footer detection

* Page number cleanup

* Language detection

* Encoding correction

Do not remove:

* Table structure

* Section headings

* Dates

* Units

* Currency symbols

* Footnotes

* Legal qualifiers

* Negative signs

* Decimal points

A normalized text record should preserve the original page reference.

# 14.12 Document Structure

Represent extracted content structurally.

JSON

```
{
  "document_id": "doc_123",
  "sections": [
    {
      "section_id": "section_1",
      "title": "Event Budget",
      "page_start": 3,
      "page_end": 4,
      "blocks": [
        {
          "type": "paragraph",
          "text": "..."
        },
        {
          "type": "table",
          "rows": [
            ["Item", "Quantity", "Cost"]
          ]
        }
      ]
    }
  ]
}
```

Structure improves:

* Retrieval

* Citations

* Summarization

* Table understanding

* Page navigation

* Agent verification

# 14.13 Chunking Strategy

Chunking should be structure-aware.

## 14.13.1 Chunk Types

* Paragraph chunk

* Section chunk

* Table chunk

* List chunk

* Page chunk

* Heading-plus-content chunk

* Overlapping text chunk

## 14.13.2 Chunk Metadata

```
chunk_id
document_id
file_id
page_number
section_id
chunk_index
text
token_count
language
embedding_version
sensitivity
created_at
```

## 14.13.3 Chunking Rules

A chunk should:

* Preserve semantic meaning

* Avoid splitting tables unnecessarily

* Include section heading context

* Include page references

* Stay within model limits

* Avoid excessive overlap

* Preserve source order

Example:

```
Chunk 1:
Event Budget
Food and catering costs...

Chunk 2:
Event Budget
Decoration and venue costs...
```

# 14.14 Search Architecture

Use hybrid search.

```
User Query
    ├── Keyword Search
    ├── Vector Search
    ├── Metadata Filtering
    └── Permission Filtering
             ↓
         Candidate Set
             ↓
           Reranker
             ↓
        Evidence Set
```

## 14.14.1 Keyword Search

Useful for:

* Names

* IDs

* Exact phrases

* Dates

* Legal terms

* Product names

* Invoice numbers

* Currency values

PostgreSQL full-text search may be sufficient for the initial version.

## 14.14.2 Vector Search

Useful for:

* Semantic questions

* Paraphrased content

* Conceptual retrieval

* Similar documents

* Multilingual matching

Possible implementation:

* PostgreSQL + pgvector

* Dedicated vector database

* Local vector index

## 14.14.3 Metadata Filtering

Before retrieval results reach the model, filter by:

* User ID

* Space ID

* Membership

* Visibility

* File status

* Document classification

* Retention status

* Consent

* Agent scope

Permission filtering must happen server-side.

# 14.15 RAG Retrieval Pipeline

```
User Question
    ↓
Query Normalization
    ↓
Intent Detection
    ↓
Scope Resolution
    ↓
Permission Filter
    ↓
Keyword Search
    ↓
Vector Search
    ↓
Merge Results
    ↓
Rerank
    ↓
Select Evidence
    ↓
Context Budgeting
    ↓
Agent Generation
    ↓
Citation Verification
```

## 14.15.1 Retrieval Result

JSON

```
{
  "chunk_id": "chunk_789",
  "document_id": "doc_123",
  "file_id": "file_456",
  "page_number": 4,
  "text": "The estimated event cost is 12,500.",
  "score": 0.93,
  "scope": "family_group_45"
}
```

## 14.15.2 Retrieval Limits

Enforce:

* Maximum candidate count

* Maximum chunks per document

* Maximum total tokens

* Maximum document age where relevant

* Maximum sensitive chunks

* Maximum retrieval time

Example:

```
Keyword candidates: 30
Vector candidates: 30
Merged candidates: 50
Reranked evidence: 8
Final context chunks: 5
```

# 14.16 Citation Architecture

Every RAG answer should retain source references.

## 14.16.1 Citation Object

JSON

```
{
  "citation_id": "citation_123",
  "file_id": "file_456",
  "document_id": "doc_123",
  "page_number": 4,
  "chunk_id": "chunk_789",
  "quote_start": 0,
  "quote_end": 120
}
```

## 14.16.2 User Interface

The client should display:

```
The estimated event cost is ₹12,500.

Source:
family_budget.pdf — Page 4
```

Actions:

* Open document

* Jump to page

* Highlight source text

* View document metadata

* Report incorrect citation

## 14.16.3 Citation Validation

Before finalizing an answer:

1. Identify factual claims.

2. Map claims to evidence.

3. Check evidence relevance.

4. Check source authorization.

5. Check page and chunk references.

6. Remove unsupported claims.

7. Mark uncertainty where necessary.

The agent must not invent page numbers or source references.

# 14.17 Secure Agent File Access

Agents should access files through tools.

Recommended tools:

```
files.list
files.get_metadata
files.search
files.get_page
files.get_text
files.get_preview
files.create_share_link
files.summarize
files.extract_tables
files.delete
files.request_access
```

Each tool must enforce:

* User authorization

* Space scope

* File visibility

* Agent permissions

* File status

* Consent

* Data classification

## 14.17.1 Example Agent File Search

JSON

```
{
  "query": "event budget",
  "space_id": "family_group_45",
  "file_types": ["application/pdf"],
  "max_results": 10
}
```

The agent must not be able to change:

JSON

```
{
  "space_id": "another_private_group"
}
```

to bypass authorization.

The runtime must derive or validate the scope from the authenticated request.

# 14.18 File Sharing and Access

## 14.18.1 Visibility Levels

```
private
space_members
selected_members
public
agent_only
temporary_share
```

## 14.18.2 Temporary Share Links

Use:

* Short expiration

* Random unguessable token

* Optional password

* Optional recipient binding

* Download limits

* Revocation

* Audit logging

Example:

JSON

```
{
  "share_id": "share_123",
  "file_id": "file_456",
  "expires_at": "2026-09-18T18:00:00Z",
  "recipient_user_id": "user_789",
  "download_limit": 3
}
```

## 14.18.3 Public File Sharing

Public files must pass:

* Visibility authorization

* Malware scan

* Content moderation

* Personal-data scan

* Copyright or ownership checks where applicable

* Public indexing policy

Do not expose private object-storage paths.

# 14.19 File Versioning

Documents may be replaced or edited.

Use immutable versions:

```
logical_document
    ├── version_1
    ├── version_2
    └── version_3
```

Each version has:

```
document_version_id
file_id
version_number
checksum
created_by
created_at
status
```

When a new version is uploaded:

1. Keep the old version.

2. Process the new version.

3. Update the logical document pointer.

4. Rebuild affected indexes.

5. Preserve old citations.

6. Mark old content as superseded.

# 14.20 Deletion and Retention

Deletion must handle:

* Original object

* Previews

* Extracted text

* OCR output

* Page images

* Embeddings

* Search index entries

* Cached results

* Agent memory references

* Share links

* Backups

Use a deletion workflow:

```
Delete requested
    ↓
Authorization check
    ↓
Soft delete
    ↓
Revoke shares
    ↓
Remove from retrieval
    ↓
Delete derived artifacts
    ↓
Delete object
    ↓
Purge indexes
    ↓
Record audit event
```

Backups may have separate retention periods.

# 14.21 Processing Events

Recommended events:

```
file.uploaded
file.scan_started
file.scan_completed
file.quarantined
file.processing_started
file.metadata_extracted
file.page_extracted
file.ocr_completed
file.chunked
file.embeddings_created
file.indexed
file.ready
file.processing_failed
file.deleted
file.share_created
file.share_revoked
```

Example:

JSON

```
{
  "event_id": "event_123",
  "type": "file.ready",
  "file_id": "file_456",
  "document_id": "doc_789",
  "scope": "family_group_45",
  "created_at": "2026-09-18T10:00:00Z"
}
```

# 14.22 Processing Reliability

## 14.22.1 Retry Policy

Retry only retryable failures.

```
Transient storage failure → retry
Temporary provider failure → retry
Invalid PDF → do not retry indefinitely
Malware detected → quarantine
Unsupported format → mark unsupported
OCR failure → fallback or partial result
```

## 14.22.2 Dead-Letter Queue

Send permanently failed jobs to a dead-letter queue.

Store:

```
job_id
file_id
error_code
error_message
attempt_count
last_attempt_at
worker_version
```

Provide administrative tools to:

* Inspect failed jobs

* Retry selected jobs

* Reprocess with a new extractor

* Mark as resolved

* Export failure reports

## 14.22.3 Partial Processing

A large document may be partially available.

Example:

```
Pages processed: 95 / 120
Status: partially_processed
```

The UI should show:

* Processed pages

* Failed pages

* Retry option

* Available search scope

* Last processing update

Do not mark the document fully ready if required pages failed.

# 14.23 Performance and Scaling

## 14.23.1 Worker Pools

Use independent pools:

```
Upload validation workers
PDF extraction workers
OCR workers
Image workers
Office-document workers
Embedding workers
Indexing workers
Preview workers
```

OCR should have lower concurrency than native extraction because it is CPU-intensive.

## 14.23.2 Page-Level Parallelism

For a PDF with 1,000 pages:

```
1 PDF job
    ↓
1,000 bounded page jobs
    ↓
Worker pool
    ↓
Ordered collector
```

Use bounded concurrency rather than launching unlimited tasks.

Example:

```
Maximum active page jobs per document: 20
Maximum active page jobs per worker: 4
Maximum total page jobs: system capacity limit
```

## 14.23.3 Backpressure

Backpressure is required when:

* Upload rate exceeds extraction capacity

* OCR queue becomes large

* Embedding provider rate limits are reached

* Storage is slow

* Database indexing is delayed

The system should:

* Slow intake

* Apply queue limits

* Prioritize interactive requests

* Defer low-priority indexing

* Show processing status

* Avoid memory growth

## 14.23.4 Priority Queues

Suggested priorities:

```
urgent user-requested retrieval
interactive document preview
normal ingestion
background reindexing
bulk historical migration
```

A user asking a question about a newly uploaded file should not wait behind a large bulk reindex.

# 14.24 Android Screens

Recommended screens:

```
FilesScreen
FileUploadScreen
UploadProgressScreen
FileDetailScreen
DocumentViewerScreen
PageViewerScreen
SearchFilesScreen
DocumentProcessingScreen
FileShareScreen
FilePermissionsScreen
FileVersionHistoryScreen
RagAnswerScreen
CitationSourceScreen
```

Important UI states:

```
Uploading
Scanning
Processing
OCR required
Partially processed
Ready
Failed
Quarantined
Deleted
```

For RAG answers, display:

* Answer

* Source files

* Page numbers

* Confidence or uncertainty

* Open-source button

* Ask follow-up button

* Report citation button

# 14.25 Web/Desktop Screens

```
/files
/files/upload
/files/[id]
/files/[id]/versions
/files/[id]/permissions
/files/[id]/processing
/search
/knowledge
/knowledge/sources
/knowledge/index-status
/agent/rag-results
```

Desktop features:

* Multi-file upload

* Drag-and-drop upload

* Batch processing status

* Page thumbnails

* Search within document

* Citation navigation

* Version comparison

* Permission management

* Failed-job inspection for administrators

# 14.26 APIs

## List Files

http

```
GET /v1/files
```

## Get File Metadata

http

```
GET /v1/files/{file_id}
```

## Search Files

http

```
POST /v1/files/search
```

## Get Page

http

```
GET /v1/files/{file_id}/pages/{page_number}
```

## Get Extracted Text

http

```
GET /v1/files/{file_id}/text
```

## Search Knowledge

http

```
POST /v1/knowledge/search
```

## Ask About Document

http

```
POST /v1/knowledge/ask
```

## Create Share

http

```
POST /v1/files/{file_id}/shares
```

## Revoke Share

http

```
DELETE /v1/files/{file_id}/shares/{share_id}
```

## Retry Processing

http

```
POST /v1/files/{file_id}/processing/retry
```

## Delete File

http

```
DELETE /v1/files/{file_id}
```

# 14.27 Security Requirements

* Use presigned uploads.

* Validate file signatures.

* Scan files before processing.

* Isolate OCR and parsing workers.

* Prevent path traversal.

* Prevent archive bombs.

* Prevent SSRF through embedded links.

* Never execute uploaded code.

* Store objects with private access by default.

* Use short-lived share links.

* Enforce space-level authorization.

* Apply permission filtering before RAG retrieval.

* Encrypt sensitive files.

* Redact secrets from extracted text where required.

* Do not expose private filenames in public search.

* Do not include unauthorized chunks in agent context.

* Log file access and sharing events.

* Support deletion of derived artifacts.

* Revoke access when membership changes.

* Preserve citation provenance.

# 14.28 Recommended Technology Choices

|
Component

|

Recommended technology

|
| --- | --- |
|

Object storage

|

MinIO or S3-compatible storage

|
|

PDF extraction

|

PyMuPDF

|
|

PDF fallback

|

pypdf, pdfplumber

|
|

OCR

|

Tesseract + OCRmyPDF

|
|

Image processing

|

Pillow

|
|

Office extraction

|

python-docx, openpyxl, python-pptx

|
|

File detection

|

libmagic-compatible detector

|
|

Malware scan

|

ClamAV or equivalent

|
|

Queue

|

Redis Streams or durable queue

|
|

Metadata database

|

PostgreSQL

|
|

Vector search

|

pgvector

|
|

Keyword search

|

PostgreSQL full-text search

|
|

API

|

FastAPI

|
|

Validation

|

Pydantic

|
|

Worker runtime

|

Python workers

|
|

Observability

|

OpenTelemetry

|
|

File preview

|

Isolated rendering service

|
|

Encryption

|

KMS or envelope encryption

|

# 14.29 Final Architecture Decision

The platform should use:

```
Private Object Storage
        ↓
File Metadata Database
        ↓
Ingestion Queue
        ↓
Validation and Malware Scan
        ↓
Specialized Extraction Workers
        ↓
Page-Level Results
        ↓
Structure-Aware Chunking
        ↓
Hybrid Search Index
        ↓
Permission-Aware RAG Retrieval
        ↓
Evidence-Based Agent Answer
```

The main decisions are:

1. Original files live in object storage.

2. File metadata lives in PostgreSQL.

3. Files are private by default.

4. Uploads use short-lived presigned URLs.

5. Files are scanned before agent access.

6. PDF processing uses page-level jobs.

7. Extraction and OCR are separate stages.

8. Native extraction is attempted before OCR.

9. Large documents use bounded worker pools.

10. Search combines keyword and vector retrieval.

11. Authorization filtering happens before model context assembly.

12. Every citation includes document and page provenance.

13. File versions are immutable.

14. Deletion removes derived artifacts and indexes.

15. Agents access files only through registered tools.

16. Processing failures are retryable, observable, and recoverable.

17. Sensitive documents require explicit access controls.

18. RAG answers must not invent evidence or page references.

# 14.30 Acceptance Criteria

* Users can upload files from Android and web.

* Uploads use presigned URLs.

* File size and MIME type are validated.

* File signatures are verified.

* Malware scanning occurs before processing.

* Files are private by default.

* PDFs are processed page by page.

* Page results are stored in order.

* OCR runs only when required.

* Extraction confidence is recorded.

* Documents are chunked with page metadata.

* Embeddings are generated asynchronously.

* Keyword and vector search are supported.

* Search filters by authorization.

* Agents cannot access unrelated private files.

* Answers include valid citations.

* Users can open the cited page.

* Files support versions.

* Shares can expire and be revoked.

* Deleted files disappear from retrieval.

* Failed processing jobs can be retried.

* Large files do not block interactive requests.

* OCR and parsing workers are isolated.

* File access is audited.

* Sensitive file data is excluded from ordinary logs.
