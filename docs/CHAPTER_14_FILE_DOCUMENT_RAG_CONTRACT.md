# Chapter 14: File, Document, Media and RAG Contract

Status: DRAFT FOR PRODUCT, FILE PROCESSING, RETRIEVAL AND SECURITY REVIEW. This is a design and verification plan, not an implemented upload service, parser sandbox, search engine or evaluated RAG system.

## 1. Scope and Authority

This continues the [release plan](CHAPTER_01_RELEASE_PLAN.md), [identity](CHAPTER_18_IDENTITY_CONTRACT.md), [Space](CHAPTER_03_SPACE_CONTRACT.md), [data](CHAPTER_06_DATA_CONTRACT.md), [API/realtime](CHAPTER_07_API_REALTIME_CONTRACT.md), [Android](CHAPTER_08_ANDROID_CONTRACT.md), [web](CHAPTER_09_WEB_CONTRACT.md), [operations](CHAPTER_10_BACKEND_OPERATIONS_CONTRACT.md), [security/privacy](CHAPTER_11_SECURITY_PRIVACY_CONTRACT.md), [Agent runtime](CHAPTER_12_AGENT_RUNTIME_CONTRACT.md) and [scheduling](CHAPTER_13_SCHEDULING_CONTRACT.md) drafts. It develops C13-T12 into file and derivative ownership, bounded processing, retrieval, citation and deletion contracts.

- [Chapter 14](Chapter14.md) owns the source requirements. [Chapter 16](Chapter16.md), [Chapter 19](Chapter19.md) and [Chapter 20](Chapter20.md) remain dependencies for trust operations, encryption and external delivery. Their presence does not authorize a new provider, model, cloud account or live-data operation.
- Keep storage, file/version metadata, ingestion, extraction, search and answer generation distinct. PostgreSQL owns durable state and authority; private object storage holds immutable original/derived objects; authorized indexes accelerate retrieval rather than create access rights.
- M1 remains the synthetic ordinary family task and confirmed one-time in-app reminder. A later synthetic file/retrieval demonstration is a separate slice, not an added M1 prerequisite or proof of the complete MVP. Public media, complex Office/audio/video processing, external models and care documents retain their own release gates.
- A scanned upload is not necessarily searchable; an extracted passage is not a confirmed medical instruction; a citation is not proof that an answer is supported. The MVP Agent's health-record and external-action restrictions remain in force even when a document can technically be processed.
- The source has a completed architecture-decision list and acceptance section. Preserve those exactly below. Additional state, security, API, test and operating policies are proposed refinements, not silently approved source changes.
- Preserve all original sources and earlier drafts. Continued design does not authorize code, package installation, file uploads, private document inspection, model/provider calls, device actions, provisioning, spending or deployment.
- All file-processing, storage, database, retrieval/model, client and security tests are NOT RUN. Document checks and synthetic fixture checks prove only the stated document properties, not runtime isolation, retrieval quality, malware detection or production readiness.

## 2. Exact Source Topics

All thirty numbered topic titles and their source anchors are retained.

| ID | Source topic | Source reference |
| --- | --- | --- |
| C14-S01 | Purpose | [14.1](Chapter14.md#L5) |
| C14-S02 | High-Level Architecture | [14.2](Chapter14.md#L75) |
| C14-S03 | File Storage Design | [14.3](Chapter14.md#L113) |
| C14-S04 | Upload Workflow | [14.4](Chapter14.md#L209) |
| C14-S05 | File Validation | [14.5](Chapter14.md#L290) |
| C14-S06 | Malware Scanning | [14.6](Chapter14.md#L354) |
| C14-S07 | Document Processing Pipeline | [14.7](Chapter14.md#L382) |
| C14-S08 | PDF Processing | [14.8](Chapter14.md#L437) |
| C14-S09 | Recommended Open-Source Extraction Tools | [14.9](Chapter14.md#L513) |
| C14-S10 | OCR Architecture | [14.10](Chapter14.md#L640) |
| C14-S11 | Text Normalization | [14.11](Chapter14.md#L706) |
| C14-S12 | Document Structure | [14.12](Chapter14.md#L750) |
| C14-S13 | Chunking Strategy | [14.13](Chapter14.md#L796) |
| C14-S14 | Search Architecture | [14.14](Chapter14.md#L863) |
| C14-S15 | RAG Retrieval Pipeline | [14.15](Chapter14.md#L949) |
| C14-S16 | Citation Architecture | [14.16](Chapter14.md#L1021) |
| C14-S17 | Secure Agent File Access | [14.17](Chapter14.md#L1084) |
| C14-S18 | File Sharing and Access | [14.18](Chapter14.md#L1147) |
| C14-S19 | File Versioning | [14.19](Chapter14.md#L1210) |
| C14-S20 | Deletion and Retention | [14.20](Chapter14.md#L1249) |
| C14-S21 | Processing Events | [14.21](Chapter14.md#L1299) |
| C14-S22 | Processing Reliability | [14.22](Chapter14.md#L1337) |
| C14-S23 | Performance and Scaling | [14.23](Chapter14.md#L1405) |
| C14-S24 | Android Screens | [14.24](Chapter14.md#L1490) |
| C14-S25 | Web/Desktop Screens | [14.25](Chapter14.md#L1540) |
| C14-S26 | APIs | [14.26](Chapter14.md#L1576) |
| C14-S27 | Security Requirements | [14.27](Chapter14.md#L1666) |
| C14-S28 | Recommended Technology Choices | [14.28](Chapter14.md#L1708) |
| C14-S29 | Final Architecture Decision | [14.29](Chapter14.md#L1882) |
| C14-S30 | Acceptance Criteria | [14.30](Chapter14.md#L1946) |

## 3. Exact Source Decisions and Acceptance

The eighteen numbered decisions in section 14.29 are retained verbatim. Their implementation and the policy choices needed to make them precise remain unverified.

| ID | Source architecture decision |
| --- | --- |
| C14-F01 | Original files live in object storage. |
| C14-F02 | File metadata lives in PostgreSQL. |
| C14-F03 | Files are private by default. |
| C14-F04 | Uploads use short-lived presigned URLs. |
| C14-F05 | Files are scanned before agent access. |
| C14-F06 | PDF processing uses page-level jobs. |
| C14-F07 | Extraction and OCR are separate stages. |
| C14-F08 | Native extraction is attempted before OCR. |
| C14-F09 | Large documents use bounded worker pools. |
| C14-F10 | Search combines keyword and vector retrieval. |
| C14-F11 | Authorization filtering happens before model context assembly. |
| C14-F12 | Every citation includes document and page provenance. |
| C14-F13 | File versions are immutable. |
| C14-F14 | Deletion removes derived artifacts and indexes. |
| C14-F15 | Agents access files only through registered tools. |
| C14-F16 | Processing failures are retryable, observable, and recoverable. |
| C14-F17 | Sensitive documents require explicit access controls. |
| C14-F18 | RAG answers must not invent evidence or page references. |

All twenty-five source acceptance criteria in section 14.30 are retained verbatim. These are required behaviors, not reported test results.

| ID | Source acceptance criterion |
| --- | --- |
| C14-A01 | Users can upload files from Android and web. |
| C14-A02 | Uploads use presigned URLs. |
| C14-A03 | File size and MIME type are validated. |
| C14-A04 | File signatures are verified. |
| C14-A05 | Malware scanning occurs before processing. |
| C14-A06 | Files are private by default. |
| C14-A07 | PDFs are processed page by page. |
| C14-A08 | Page results are stored in order. |
| C14-A09 | OCR runs only when required. |
| C14-A10 | Extraction confidence is recorded. |
| C14-A11 | Documents are chunked with page metadata. |
| C14-A12 | Embeddings are generated asynchronously. |
| C14-A13 | Keyword and vector search are supported. |
| C14-A14 | Search filters by authorization. |
| C14-A15 | Agents cannot access unrelated private files. |
| C14-A16 | Answers include valid citations. |
| C14-A17 | Users can open the cited page. |
| C14-A18 | Files support versions. |
| C14-A19 | Shares can expire and be revoked. |
| C14-A20 | Deleted files disappear from retrieval. |
| C14-A21 | Failed processing jobs can be retried. |
| C14-A22 | Large files do not block interactive requests. |
| C14-A23 | OCR and parsing workers are isolated. |
| C14-A24 | File access is audited. |
| C14-A25 | Sensitive file data is excluded from ordinary logs. |

Preserve the following source status inventories without treating a single enum as the complete security or processing state machine. Storage, scan, processing coverage, index publication and access eligibility are separate dimensions.

| Source list | Values in source order |
| --- | --- |
| File statuses, 14.3.3 | created, uploading, uploaded, scanning, processing, ready, partially_processed, failed, quarantined, deleted |
| Important UI states, 14.24 | Uploading, Scanning, Processing, OCR required, Partially processed, Ready, Failed, Quarantined, Deleted |

All twenty security requirements in section 14.27 remain verbatim. A requirement is not evidence that a scanner, encryption control or permission filter has been implemented.

| ID | Source security requirement |
| --- | --- |
| C14-Q01 | Use presigned uploads. |
| C14-Q02 | Validate file signatures. |
| C14-Q03 | Scan files before processing. |
| C14-Q04 | Isolate OCR and parsing workers. |
| C14-Q05 | Prevent path traversal. |
| C14-Q06 | Prevent archive bombs. |
| C14-Q07 | Prevent SSRF through embedded links. |
| C14-Q08 | Never execute uploaded code. |
| C14-Q09 | Store objects with private access by default. |
| C14-Q10 | Use short-lived share links. |
| C14-Q11 | Enforce space-level authorization. |
| C14-Q12 | Apply permission filtering before RAG retrieval. |
| C14-Q13 | Encrypt sensitive files. |
| C14-Q14 | Redact secrets from extracted text where required. |
| C14-Q15 | Do not expose private filenames in public search. |
| C14-Q16 | Do not include unauthorized chunks in agent context. |
| C14-Q17 | Log file access and sharing events. |
| C14-Q18 | Support deletion of derived artifacts. |
| C14-Q19 | Revoke access when membership changes. |
| C14-Q20 | Preserve citation provenance. |

The eighteen component/technology pairs in section 14.28 are source recommendations, not a dependency lockfile. Deployment, version, license, capability and vulnerability review are required before selection.

| ID | Source component | Source recommended technology |
| --- | --- | --- |
| C14-B01 | Object storage | MinIO or S3-compatible storage |
| C14-B02 | PDF extraction | PyMuPDF |
| C14-B03 | PDF fallback | pypdf, pdfplumber |
| C14-B04 | OCR | Tesseract + OCRmyPDF |
| C14-B05 | Image processing | Pillow |
| C14-B06 | Office extraction | python-docx, openpyxl, python-pptx |
| C14-B07 | File detection | libmagic-compatible detector |
| C14-B08 | Malware scan | ClamAV or equivalent |
| C14-B09 | Queue | Redis Streams or durable queue |
| C14-B10 | Metadata database | PostgreSQL |
| C14-B11 | Vector search | pgvector |
| C14-B12 | Keyword search | PostgreSQL full-text search |
| C14-B13 | API | FastAPI |
| C14-B14 | Validation | Pydantic |
| C14-B15 | Worker runtime | Python workers |
| C14-B16 | Observability | OpenTelemetry |
| C14-B17 | File preview | Isolated rendering service |
| C14-B18 | Encryption | KMS or envelope encryption |

The eleven file-type/tool pairs from section 14.9 are also preserved. A fallback changes extraction strategy only within reviewed resource and trust limits; it cannot bypass quarantine or repeatedly exhaust the same broken file.

| ID | Source file type | Source tools |
| --- | --- | --- |
| C14-L01 | PDF native text | PyMuPDF, pypdf |
| C14-L02 | PDF layout | PyMuPDF, pdfplumber |
| C14-L03 | PDF tables | Camelot, Tabula-compatible tools |
| C14-L04 | OCR | Tesseract, OCRmyPDF |
| C14-L05 | Office documents | python-docx, python-pptx, openpyxl |
| C14-L06 | HTML | BeautifulSoup, lxml |
| C14-L07 | Markdown | Markdown parser |
| C14-L08 | Images | Pillow |
| C14-L09 | Audio | FFmpeg + approved transcription engine |
| C14-L10 | Video | FFmpeg + transcription engine |
| C14-L11 | Metadata | file-type detection library, custom parsers |

## 4. Exact Source API and Client Inventory

The thirteen method/path pairs below comprise the two upload operations in section 14.4 and eleven operations in section 14.26. Other commands or canonical version/derivative selectors are not implied merely by this list.

| ID | Source operation |
| --- | --- |
| C14-P01 | `POST /v1/files/upload-sessions` |
| C14-P02 | `POST /v1/files/{file_id}/complete` |
| C14-P03 | `GET /v1/files` |
| C14-P04 | `GET /v1/files/{file_id}` |
| C14-P05 | `POST /v1/files/search` |
| C14-P06 | `GET /v1/files/{file_id}/pages/{page_number}` |
| C14-P07 | `GET /v1/files/{file_id}/text` |
| C14-P08 | `POST /v1/knowledge/search` |
| C14-P09 | `POST /v1/knowledge/ask` |
| C14-P10 | `POST /v1/files/{file_id}/shares` |
| C14-P11 | `DELETE /v1/files/{file_id}/shares/{share_id}` |
| C14-P12 | `POST /v1/files/{file_id}/processing/retry` |
| C14-P13 | `DELETE /v1/files/{file_id}` |

All thirteen Android screen names from section 14.24 are preserved. They are planned surfaces, not existing Compose implementations.

| ID | Source Android screen |
| --- | --- |
| C14-C01 | FilesScreen |
| C14-C02 | FileUploadScreen |
| C14-C03 | UploadProgressScreen |
| C14-C04 | FileDetailScreen |
| C14-C05 | DocumentViewerScreen |
| C14-C06 | PageViewerScreen |
| C14-C07 | SearchFilesScreen |
| C14-C08 | DocumentProcessingScreen |
| C14-C09 | FileShareScreen |
| C14-C10 | FilePermissionsScreen |
| C14-C11 | FileVersionHistoryScreen |
| C14-C12 | RagAnswerScreen |
| C14-C13 | CitationSourceScreen |

All eleven source web paths from section 14.25 are retained literally. Their placement under the proposed Chapter 9 workspace shell and dynamic-route syntax must be reconciled before implementation; this inventory does not create another root routing scheme.

| ID | Source web path |
| --- | --- |
| C14-H01 | `/files` |
| C14-H02 | `/files/upload` |
| C14-H03 | `/files/[id]` |
| C14-H04 | `/files/[id]/versions` |
| C14-H05 | `/files/[id]/permissions` |
| C14-H06 | `/files/[id]/processing` |
| C14-H07 | `/search` |
| C14-H08 | `/knowledge` |
| C14-H09 | `/knowledge/sources` |
| C14-H10 | `/knowledge/index-status` |
| C14-H11 | `/agent/rag-results` |

All eleven registered-tool names from section 14.17 and sixteen event names from section 14.21 are retained. Listing a tool does not expose it to every Agent or release scope.

| ID | Source Agent tool |
| --- | --- |
| C14-U01 | files.list |
| C14-U02 | files.get_metadata |
| C14-U03 | files.search |
| C14-U04 | files.get_page |
| C14-U05 | files.get_text |
| C14-U06 | files.get_preview |
| C14-U07 | files.create_share_link |
| C14-U08 | files.summarize |
| C14-U09 | files.extract_tables |
| C14-U10 | files.delete |
| C14-U11 | files.request_access |

| ID | Source processing event |
| --- | --- |
| C14-E01 | file.uploaded |
| C14-E02 | file.scan_started |
| C14-E03 | file.scan_completed |
| C14-E04 | file.quarantined |
| C14-E05 | file.processing_started |
| C14-E06 | file.metadata_extracted |
| C14-E07 | file.page_extracted |
| C14-E08 | file.ocr_completed |
| C14-E09 | file.chunked |
| C14-E10 | file.embeddings_created |
| C14-E11 | file.indexed |
| C14-E12 | file.ready |
| C14-E13 | file.processing_failed |
| C14-E14 | file.deleted |
| C14-E15 | file.share_created |
| C14-E16 | file.share_revoked |

The source visibility values from section 14.18.1 are `private`, `space_members`, `selected_members`, `public`, `agent_only`, `temporary_share`. They mix audience, delegation and sharing mechanism; preserve the inventory but resolve these into explicit policy dimensions rather than make `agent_only` an autonomous principal or a share link an ownership transfer.

## 5. Decisions and Release Gates

| ID | Choice | Proposed direction or unresolved behavior | Status |
| --- | --- | --- | --- |
| C14-D01 | File and derivative identity | Stable logical file plus immutable original version, exact object identity/checksum and versioned processing generations. Reprocessing does not overwrite a previously cited result. | PROPOSED |
| C14-D02 | Upload commitment | Scoped bounded upload session, quota reservation and server verification of an immutable object version before durable ingestion acceptance. A reusable presigned PUT cannot replace scanned bytes. | PROPOSED |
| C14-D03 | Supported formats and dependencies | Select supported types, actual parser/OCR/rendering versions, licenses, patch policy and isolation. Source recommendations are candidates, not installed or approved packages. | OPEN |
| C14-D04 | Quarantine and publication | Deny unsafe/unscanned access and execute risky parsing in bounded isolated workers. Publish only eligible artifacts from the exact scanned generation with current authority. | PROPOSED |
| C14-D05 | Extraction quality and languages | Define native-text/OCR triggers, supported scripts, confidence meaning, table/layout quality and manual-review thresholds; OCR is not confirmed instruction or model certainty. | OPEN |
| C14-D06 | Page and stage execution | Durable bounded stage/page jobs, fenced attempts, exact-generation uniqueness, ordered manifest and explicit partial coverage. Queue order is not page order or completion proof. | PROPOSED |
| C14-D07 | Chunk and index lineage | Preserve source version/page/anchor/extraction/chunk/embedding/index provenance; publish compatible generations atomically and retire stale eligibility before asynchronous purge. | PROPOSED |
| C14-D08 | Embedding and model processing | Choose model/provider/locality, input classification/purpose/consent, dimensionality/metric, retention, credentials and migration/evaluation policy. No default right to send private chunks to an external service. | OPEN |
| C14-D09 | Retrieval authorization | Apply current actor/resource/history/classification/purpose/Agent scope before candidates are disclosed to snippets, caches, rerankers or model context; recheck before output and source access. | PROPOSED |
| C14-D10 | Search and answer quality | Choose supported query modes, keyword/vector fusion, reranking, evidence budget, thresholds, abstention and versioned multilingual quality/latency evaluation. Illustrative top-k or token counts are not production settings. | OPEN |
| C14-D11 | Sharing, public files and encryption | Resolve authenticated versus bearer/public shares, current revocation enforcement, audience expansion, sensitive redaction, external caching and server-readable versus E2E processing modes. | OPEN |
| C14-D12 | Answers, citations and tools | Bind citations to authorized immutable source spans and verify support; untrusted document instructions cannot grant tools or authority. Open the cited generation, not whichever file version is newest. | PROPOSED |
| C14-D13 | Retention, deletion and holds | Define deletion scope/lineage, temporary uploads, legal holds, minimal audit/dedup retention, provider/backup expiry and isolated restore gates. Hiding the file row alone is not deletion. | OPEN |
| C14-D14 | Capacity and operating evidence | Agree byte/page/archive/pixel/duration/token limits, admission quotas, workload lanes, SLOs, recovery and cost budgets before enabling the corresponding processing path. | OPEN |

These seven proposals and seven open choices are unapproved. The source's functional requirements remain visible, but no generic approval or implementation continuation can bypass a missing permission, unsafe parser state, unresolved external-processing policy or the MVP Agent restrictions.

## 6. Ownership, Lineage and Processing States

### Durable Records and Authorities

| Record group | Owner and relationship | Required behavior |
| --- | --- | --- |
| Logical file/document | Domain-owned record with actual owner/context and authorized source links. | File metadata and structured document intelligence may be separate linked entities, but one canonical identity/ownership mapping governs both. Names and arbitrary object-key prefixes are not authority. |
| Immutable source version | Exact provider object version or write-once finalized object, verified bytes/digest, uploader and version number. | Never read an unversioned mutable key after scanning. Replaced content is a new version; an object-store ETag is not universally a SHA-256 digest. |
| Upload session and quota | Requester/account/context, purpose, destination, allowed size/type, reservation, expiry and completion receipt. | Concurrent sessions reserve capacity atomically; storage completion does not itself publish the file or prove current access. |
| Scan verdict | Source version/digest, engine/signature/policy version, outcome, time and minimal evidence. | Clean, threat, failed, unavailable, unsupported/encrypted and stale verdicts differ. A verdict for different bytes or a prior policy cannot approve current processing. |
| Ingestion generation | Source version plus extraction/normalization/chunk configuration and required stage manifest. | Reprocessing creates a distinct immutable generation. Schema/model/policy configuration participates in identity when it changes the result. |
| Stage/page job and result | Generation, operation, page/part identity, attempt/fenced claim and exact inputs/outputs. | One accepted result per logical operation; retries keep identity and cannot cross versions or substitute a stale worker's output. |
| Page/structure/chunk | Version and generation, physical page or typed source anchor, source order, canonical text and offset/geometry lineage. | Composite references must bind a chunk to its actual version/page. A text hash alone cannot infer ownership or deduplicate across private tenants visibly. |
| Embedding/index generation | Chunk generation, model/configuration/dimension/metric, index revision and publication manifest. | Do not mix incompatible vector spaces or publish incomplete required indexes as complete. Rebuilds cannot reset authorization. |
| Share/grant and access receipt | Actual target version/range, recipient/purpose/expiry/revocation/download policy. | Stored links and old access receipts do not confer current membership or rights after revocation. |
| Answer and citation | Request/context/authorized evidence manifest, immutable source anchors and validation outcome. | Answers, snippets, citations, caches and Agent checkpoints inherit disclosure and retention restrictions from their inputs. |
| Deletion and recovery ledger | Source/derivative lineage, current exclusion/tombstone, jobs, shares, provider retention and backup policy. | Remove eligibility before asynchronous purge; late processing, replay or restore cannot resurrect withdrawn content. |

Reuse the data contract's files/documents/pages/chunks/embeddings and durable job/outbox authorities rather than invent parallel file databases for every tool. Conditional uniqueness handles non-page assets and nullable fields deliberately. The source `UNIQUE(file_id, page_number, extraction_version)` needs the precise immutable source-version/generation identity behind it; otherwise two versions can collide or a rerun can overwrite old citations.

### Proposed State Dimensions

| Dimension | Candidate states or evidence | What it does not prove |
| --- | --- | --- |
| Transfer | Created, uploading, finalized, abandoned/expired; exact object commitment. | Uploaded does not mean clean, parsed, indexed or shareable. |
| Scan | Pending, running, clean, threat/quarantined, failed/unavailable, unsupported; versioned verdict. | A clean malware result does not make active content safe to render or parsing infallible. |
| Processing coverage | Queued, running, partial, complete, failed, cancelled/unsupported; required versus optional stage/page outcomes. | Finishing one page or OCR stage does not complete a document. |
| Publication | Unpublished, approved partial snapshot, complete current generation, superseded, excluded. | A generation in an index is not permission to return it or a guarantee all modalities are present. |
| Access/lifecycle | Current grant/classification/history, restricted, deleted/held, key unavailable, expired. | A historical ready flag, legal hold or retained blob is not present read/Agent authority. |

Canonical names/transitions remain a schema gate. Derive the source-facing file/UI statuses from these states without forcing security or progress into one mutable enum. Mark required missing pages/stages explicitly; `ready` means the released capability's declared manifest is complete and eligible, not that every possible media/model feature has run. A keyword-only result may be usable when vector generation is unavailable only under an explicit degraded-mode policy with honest UI, not an invented full hybrid result.

### File and Retrieval Invariants

| ID | Rule | Enforcement boundary |
| --- | --- | --- |
| C14-K01 | Authority follows the actual source and current actor. | Owner/context/history/visibility/classification/consent and scoped Agent delegation on every command, stage, search, share and source access. |
| C14-K02 | Accepted bytes are immutable and verified. | Scoped upload session plus actual-size/signature/digest and exact version commitment; scan, parse and read bind the same bytes. |
| C14-K03 | Untrusted or unavailable scans never fail open. | Private quarantine and version-bound clean verdict before released parsing/preview/search/Agent paths. |
| C14-K04 | Parsing is isolated and bounded. | Maintained reviewed libraries in least-privilege resource/egress-limited workers; no scripts, macros, external entity fetches or unsafe archive paths. |
| C14-K05 | Durable stage work survives crashes without stale publication. | Atomic stage result/next work/outbox, stable operation identity, fencing and current source-generation/lifecycle checks. |
| C14-K06 | Coverage and order are explicit. | Expected page/part manifest, numeric source order and required-stage completion; no whole-document readiness from queue arrival order. |
| C14-K07 | Extraction retains meaning and uncertainty. | Original/normalized text mapping, structural spans, script/method/quality provenance and review, not a fabricated uniform confidence score. |
| C14-K08 | Every derivative retains exact lineage. | Version/generation/page/anchor/configuration references through chunks, vectors, previews, answers and deletion. |
| C14-K09 | Index publication is compatible and atomic. | Staged verified generation, current eligible pointer and reconciliation; model/dimension/metric changes cannot mix incompatible embeddings. |
| C14-K10 | Unauthorized candidates do not reach disclosure or providers. | Current server-side scope filter before candidate output, snippets, reranking or context; stale index ACLs/cache keys are not final authority. |
| C14-K11 | Retrieval is bounded and evidence-aware. | Query/candidate/token/time/cost constraints, tested hybrid ranking, explicit partial/no-evidence/conflict states and no guessed answers. |
| C14-K12 | Citations identify exact support, not just a valid file. | Verified source-version/generation/typed anchor, offset units/quote mapping and claim support, with current access on reopening. |
| C14-K13 | Document text never becomes system authority. | Untrusted passages/OCR/metadata/links cannot change tool scopes, memory policy or approvals; deterministic tool execution remains separate. |
| C14-K14 | Sharing is an explicit bounded disclosure. | Current share/audience authority, recipient/expiry/version and revocation-aware delivery path; no promise to recall previously delivered bytes. |
| C14-K15 | Deletion and revocation precede purge or replay. | Immediate eligibility exclusion at policy boundaries and complete lineage cleanup/reconciliation; restore replays current privacy state. |
| C14-K16 | Clients and operations reflect measurable truth. | Honest scoped progress, accessibility, private telemetry/audit, budgeted lanes and real fault/quality evidence, not document-only certification. |

## 7. Upload, Validation and Immutable Publication

### C14-W01 Admit a Scoped Upload Session

Authenticate the actor and verify the real owning account/Space/page/conversation/source purpose and permitted attachment audience/history. A caller cannot select another owner's object key, encryption key, ready status, classification downgrade or private conversation merely because it knows an ID. Separate permission to upload from permission to publish publicly, expose to an Agent or use an external processor.

Validate bounded filename metadata, declared type/size, supported format and source purpose; reserve file-count/byte capacity atomically across concurrent uploads and include temporary/multipart/derivative retention in the quota policy. A claimed small size is provisional. Rate-limit sessions and scope their lifetime, part count and permitted operation; abandoned or expired reservations are reconciled without freeing capacity while an accepted object still consumes it.

Create the durable logical file/version-intent and upload session with an unpredictable server-generated staging key. Issue only short-lived provider-supported scoped PUT/POST/multipart capabilities with validated constraints, not permanent storage credentials, read/list permissions or arbitrary object destinations. Verify actual provider behavior for payload limits, checksums, signed headers and multipart completion; a client header alone cannot enforce a limit the storage service ignores. Do not log capability URLs or treat a path prefix/CORS as access control.

M1 does not gain a file requirement. A later first file slice can select a bounded synthetic native-text PDF in a private admitted Space, with no health records or real provider/model input. Resumable uploads and background transfer require their own account-isolated client/lifetime policy rather than replaying an old capability after logout.

### C14-W02 Finalize the Exact Bytes and Enqueue Ingestion

On completion, recheck current actor/session/ownership/expiry, exact storage object/version, actual byte size, provider-trusted or server-computed digest and safely detected signature/type. A client-supplied checksum is a claim to compare, not independent proof of malicious-content safety. Small bounded format detection and validators are themselves untrusted-input code and require appropriate isolation; ordinary HTTP handlers do not fully parse arbitrary documents to verify them.

Prevent the presigned-upload overwrite race explicitly. One reviewed strategy is a staging upload followed by a server-side copy/read of a specific immutable staging version into a write-once final version; another can pin a provider version ID with tested immutability/access guarantees. Conditional-copy or lock behavior must match the selected provider. Never verify/scan one unversioned key, then later serve or parse whatever bytes occupy that key. Unexpired upload URLs may still create orphan staging bytes after cancel/delete; they cannot republish a tombstoned file and need bounded cleanup.

Commit canonical source-version metadata, storage/digest reference, consumed quota, ingestion job/outbox, status and mandatory audit intent together. Object storage and PostgreSQL are not one atomic transaction: stage orphans, failed promotion and lost completion replies need stable receipts and reconciliation, not blind deletion of a valid accepted object or a duplicate version on retry. A repeated completion of identical intent returns the authorized canonical receipt; mismatched payload/version conflicts.

Expose uploaded/pending scan, not ready. A queue notification is a wake-up hint for durable work; a lost publication after database commit must be found by the reconciler. No model, browser session or device process must remain alive for accepted ingestion to proceed.

### C14-W03 Validate and Scan Without Executing Content

Use a private quarantine namespace with no ordinary preview/download/search/Agent read path for pending or rejected content. Apply allowlisted format/signature/size policy and handle extension/MIME disagreement, encrypted/password-protected input, nested containers and polyglot or embedded active content deliberately. A magic-byte match is not full validity or safety. Unsupported or unverifiable content may be stored under a separately reviewed restricted policy, but must not fall through into normal processing or appear clean.

Archive inspection uses maintained container libraries with canonicalized paths confined to a private workspace. Bound actual expanded bytes, entries, nesting, per-entry size, compression ratio and wall/CPU/memory/disk use, not only the advertised archive directory. Reject traversal, absolute/device paths, symlinks/hardlinks or other unsupported link types, duplicate/colliding paths and platform-specific separators/case/Unicode collisions. Never unpack into application code, a shared document folder or a served tree. These controls reduce risk; listing them is not proof that every archive attack is prevented.

Run the scanner with a bounded current engine/signature policy and record the exact source version/digest, result and configuration. Clean, infected, scan timeout/unavailable and unsupported cannot collapse into success. Recheck lifecycle/current processing permission before releasing work; a later revocation/delete or superseding version can block an otherwise clean result. A clean scan does not authorize executing PDF JavaScript, Office macros, embedded executables, HTML/SVG scripts or external references.

Disable ambient network/external entity resolution in parsers/renderers, including remote Office resources, XML DTDs, image links and media protocols. No arbitrary document URL fetch occurs during ingestion. A separately released fetch tool would require Chapter 11's destination/DNS/redirect/egress policy and explicit authority; embedding a URL cannot invoke it. File passwords, if ever supported, need a scoped ephemeral secret workflow, not a chat/log field; unavailable decryption stays visibly blocked.

### C14-W04 Claim Bounded Stage and Page Work

Create the generation's required-stage/expected-page manifest and durable operation identities after eligible source validation. A job binds the source version, processing generation, stage/page or typed part, configuration and parent scope. Keep attempts, worker version and lease/fence separate from the logical result key. A retry cannot choose the latest logical file pointer and accidentally process a different version.

Claim short bounded work using tested database/queue semantics and owner/fencing tokens. Native extraction, OCR, media transcode and preview generation run outside database locks in isolated low-privilege workers with limited CPU, memory, wall time, scratch disk, open files and no unnecessary secrets/egress. Containers are a deployment component, not automatic sandbox proof; validate actual filesystem/network/process restrictions and patch/runtime behavior.

Page-level PDF processing permits out-of-order completion but must respect source ordering and a bounded page admission window. Some parsers need a shared random-access source/xref or metadata pass; do not promise memory independence merely because a job names one page. Measure the actual parser and bound shared download/mapping/scratch use so each of thousands of jobs does not refetch or materialize the entire file without limit.

Commit each accepted result reference/digest, stage progress, next durable work and completion outbox atomically where owned by the same database. Acknowledge transport only after that durable progress. Stale leases, wrong generations, revoked/deleted sources and cancelled jobs cannot publish; orphaned outputs are cleaned under the artifact ledger. Retries may reuse only identical compatible outputs verified by provenance, not any object with the expected filename.

## 8. Extraction, OCR, Structure and Chunking

### C14-W05 Extract and Normalize With Reviewable Provenance

Choose the reviewed native-text path first, then assess actual page-level quality and coverage before invoking layout extraction/OCR. A page can mix selectable text, a scanned region, tables and images; a small amount of extracted text is not proof that all content was captured. Explicit user-requested OCR still obeys scope, scan, budgets and supported-language policy. Avoid duplicate native-plus-OCR text and do not retry every fallback indefinitely on malformed input.

Record method, engine/configuration/language, relevant extraction metrics and uncertainty with each result. OCR confidence is engine-specific, not universally calibrated between tools or a probability that a factual statement is true. Native extraction may have no meaningful numeric confidence; represent not-provided/quality flags rather than fabricate 1.0. Mixed scripts, handwriting, rotation, low contrast, formulas and table associations may need human review or explicit partial results.

Retain raw extracted output and a versioned canonical normalized representation with source mapping. Unicode normalization, dehyphenation, whitespace/footer cleanup and redaction must preserve or deliberately annotate meaning, including minus signs, decimals, units, currency, dates, footnotes, qualifiers and table row/column association. Do not strip a repeated header that contains a legally relevant qualifier, concatenate two columns into a false sentence or silently replace an uncertain dose. Preserve original-versus-normalized offsets/geometry sufficient to explain every displayed quote.

Represent paragraphs, headings, lists, tables and sections with stable block IDs and physical page/region references. PDF physical page ordinal is not necessarily the printed page label. Record page dimensions, crop box, rotation, coordinate origin/units and extraction transforms for reliable highlighting. Oversized tables may need structured row groups with repeated headers and explicit continuation references rather than a token-limit truncation that loses units or relationships.

Office files need document/sheet/slide/cell/paragraph anchors appropriate to the format; a reflowing document does not have a stable page number without a pinned renderer/layout. Audio/video require bounded duration/codec/protocol handling and timestamp anchors tied to the immutable media/transcript generation; image/OCR anchors may be regions. Source page-centric examples are not permission to invent pages for non-paginated media. File-generated reports are still classified/versioned outputs, not inherently trustworthy merely because an Agent wrote them.

Publishing corrected OCR or a new extractor creates a new derivation with its own provenance; prior cited text remains addressable only while still authorized and retained. For sensitive sources, required redaction creates a specific audience/classification-safe derivative; it does not authorize broader access to the raw extraction. Unreviewed extraction never becomes confirmed medicine instructions, diagnosis or general Agent memory automatically.

### C14-W06 Build Chunks and Publish a Truthful Coverage Manifest

Collect accepted page/part results by immutable generation and numeric source order, not worker completion order or lexical filename sorting. Maintain the known expected count plus pending/failed/cancelled/unsupported parts and required versus optional stages. A failed page remains a named gap; later pages must not be renumbered to hide it. The source 95/120 example is partial even when the successful pages are searchable.

Apply a versioned structure-aware chunk policy with stable IDs, language, token-count method, section context and precise page/block/span lineage. Keep overlap bounded and preserve qualifiers/table relations; multi-page chunks carry every real source span instead of claiming one convenient page. Split oversized structures with explicit continuation when necessary; no document can force unlimited context by placing its whole content in one table or heading.

Enforce relational same-source/generation constraints across pages, structures, chunks and embeddings. A chunk's sensitivity/audience can narrow its source permissions; it cannot widen them. Include enough pipeline configuration in dedup identity to distinguish meaningful parser/normalization/chunk changes, while a repeated attempt at the same logical stage does not mint duplicate chunks. Cross-account content deduplication must not expose matching hashes, filenames, existence or quotas, and deleting one owner's reference cannot delete another's independently authorized data.

Publish a reviewed partial or complete manifest through an atomic current-generation decision after checking all required artifacts and current source eligibility. Define whether a partial generation can answer questions, which parts it may use and how gaps appear in the result; no answer may imply it searched the whole document when required pages failed. New corrected generations stage separately until compatible publication; late old results cannot modify the selected snapshot.

## 9. Embeddings, Hybrid Search and Retrieval

### C14-W07 Build and Publish Compatible Search Generations

Keep PostgreSQL full-text search plus a reviewed pgvector deployment as a candidate initial hybrid implementation, not a requirement for a separate search cluster. Select index/operator classes and dimensionality from the actual embedding model, metric, expected cardinality, language and measured query workload. A 1,536-dimensional example elsewhere is not a universal schema. Keyword, metadata and vector paths must agree on source identity, processing coverage and current eligibility.

Embedding generation is a separately budgeted durable stage over eligible immutable chunks. Confirm that the intended local engine or external provider may process that classification/purpose/region under the applicable consent/legal basis and retention/training policy before sending text. A worker service credential or stored file does not itself authorize external processing. The same rule applies to query embeddings, reranking, transcription, summarization and evaluation uploads; private questions can be sensitive even without document text.

Bind each embedding to exact chunk/generation and model/provider/configuration/revision/dimension/metric identity. Repeated delivery of a job uses the same logical result and records attempts/cost; a network timeout may require a bounded provider-specific retry and budget reconciliation, not an assumption of free duplicate inference. Maintain request limits and observed spend separately from estimates. Never silently substitute a different model or mix vector spaces during fallback.

Build new index generations in staging and validate expected chunk/embedding counts, configuration compatibility, coverage and current source authority. Atomically switch the authorized publication pointer or equivalent queryable generation selector only after the required manifest is ready. PostgreSQL and an external search service are not one transaction; durable intent, reconciliation and a query-time eligibility gate must handle missing or stale index updates. A tombstone or ACL change becomes ineligible before asynchronous index cleanup completes.

Reindexing/chunk/model upgrades retain the old published generation until the reviewed replacement is usable, subject to current security restrictions. Keep old citation lineage while legally retained, but do not return superseded content as current without a deliberate historical-version query. Query embeddings must match the selected index model; parallel old/new migration queries remain separated with defined merging and quality evidence. Rollback cannot reactivate a deleted/restricted generation or an extractor/provider version known to violate required controls.

### C14-W08 Retrieve Only Authorized, Relevant Evidence

Resolve the authenticated requester, actual source context, requested purpose and current resource/history/classification/consent/Agent scope on the server. A user-supplied `space_id`, list of file IDs, vector namespace or metadata filter can narrow a permitted search but cannot expand it. Anonymous public search is a deliberate public principal with published-content eligibility, not a failed login downgraded to public access. A private file attached to a public post does not become public automatically.

Perform current authorization and generation eligibility within the candidate retrieval boundary before text, titles, filenames, counts, scores or snippets reach an application consumer, cache, reranker, external provider or model. Prefer constrained database predicates/joins or a tested protected search service whose only output is eligible candidates. An index's copied ACL is not the current grant. A final prompt filter is too late if a forbidden candidate was already sent to a reranker or written to a trace.

Test the selected vector engine's actual filtering and approximate-nearest-neighbor behavior. Authorization filters can reduce ANN recall; fetching a broad global top-k and only then filtering disclosed candidates is not an acceptable substitute. Bounded iterative scans, partitioning or authorized exact-search fallback may improve recall inside the protected boundary, but may never weaken access filters or expose denied identifiers. RLS, if adopted, needs least-privilege roles, pool/context reset and bypass/owner tests; enabling it by name is not proof of isolation.

Normalize the query using reviewed language/tokenization rules without dropping negatives, units, dates, literal IDs or quoted phrases. PostgreSQL language configurations are not automatically adequate for every supported script, mixed-language phrase, invoice number or exact monetary value; choose measured lexical/exact-field support and test English/Telugu/Hindi where released. Semantic multilingual behavior is a model capability to evaluate, not a guarantee from the word embeddings.

Run bounded lexical/vector/metadata searches, merge by stable chunk/source identity and use a reviewed ranking/fusion scheme. Raw lexical rank and vector distance are not directly comparable probabilities. Deduplicate overlap without removing important contrasting context or mixing different document versions as if one statement. Reranking sees only authorized minimum required text and approved providers. Source candidate counts of 30/30/50/8/5 are examples, not tuned performance settings.

Apply maximum candidates, chunks per document, tokens using the selected model's tokenizer, elapsed time, sensitive-content budget and per-account aggregate cost. Include system/tool/output reservations in the model context budget rather than filling the whole limit with evidence. If constraints leave insufficient support, narrow the query, ask for clarification, return permitted partial evidence or abstain; do not silently truncate qualifiers or answer as though missing pages were read. No sources, incomplete sources and contradictory sources are distinct outcomes, but do not reveal the existence/count of hidden files.

Cache identity must include requester/scope or a proven equivalent visibility partition, purpose, policy/permission epoch, source/index/model versions and query options, with current validation on use. A cache hit never substitutes for authorization. Recheck evidence eligibility after retrieval and before external model dispatch/output as required by the defined security boundary. Revocation during work stops new disallowed disclosure and invalidates dependent cached results; already transmitted bytes cannot be recalled. Record that boundary honestly rather than claiming a last check makes an entire network operation atomic.

## 10. Evidence-Based Answers, Citations and Agent Tools

### C14-W09 Generate and Verify a Version-Bound Answer

The authorized evidence manifest is the answer's source set. Pass the model only the needed permitted passages and their server-created opaque citation identifiers, source anchors, scope and uncertainty. Treat file text, OCR, filenames, metadata, tables, embedded links and previous generated reports as untrusted data. They cannot instruct the runtime to widen a search, disclose secrets, contact a URL, delete/share a file or install a procedural memory. Prompt framing helps interpretation; deterministic scope/tool/policy checks remain the enforcement.

Separate document-supported claims from general explanation and unknowns. Verify citation IDs and exact source/version/generation/page-or-anchor relationships deterministically, then assess whether each material claim is supported by its actual evidence and relevant context. The existence of a page or matching phrase is not entailment: negation, units, table headers, dates, superseded versions and conflicting sources matter. Recompute supported arithmetic using structured values and reviewed rules where feasible; a second model can assist evaluation but is not sole proof.

Remove or qualify unsupported claims, explicitly show relevant disagreement or extraction uncertainty, and abstain when the authorized evidence is inadequate. A retrieval score or OCR confidence is not an answer-confidence percentage. Do not turn a partially processed file into a whole-document summary without disclosing its actual coverage. Health/care sources retain the separate product restrictions; cited OCR is not verified dosage and a tool-mediated answer is not a clinical approval.

### Citation and Anchor Contract

Every citation binds logical file/document, immutable source version, processing generation, chunk/structure identity, quoted span and typed source anchor. PDF citations include physical 1-based page ordinal and optional printed page label. Sheets/slides/text/media use their real sheet/cell/slide/block/timestamp/region anchors; satisfy the source's provenance intent without inventing page numbers for formats that have no stable pages. If pagination is produced by a renderer, pin that renderer/layout/artifact generation.

Define `quote_start` and `quote_end` against one canonical text representation with an explicit offset unit and interval convention. A proposed portable convention is zero-based Unicode scalar-value offsets with an end-exclusive interval; it is not silently identical to JavaScript/Kotlin UTF-16 indices, bytes or user-perceived grapheme positions. Preserve the normalization/redaction-to-source mapping and test combining marks and non-BMP characters. Invalid bounds or a mismatched quote/source generation are rejected rather than highlighted at the nearest convenient text.

Geometry has explicit page dimensions, crop/rotation, coordinate origin and transformation to the rendered viewport. Text selection and highlighting use the retained source mapping; a successful substring check alone does not prove the visual box. Multi-span/table answers cite all necessary row/header/qualifier anchors rather than a single chunk containing only a number.

Opening a citation reauthorizes the exact cited version and derivative. It never silently opens the latest version or fetches a raw object key supplied by the model. Superseded-but-retained content can display its historical status when permitted; deleted, expired, key-unavailable or no-longer-authorized content returns a safe unavailable state. Preserving provenance does not override deletion, a subject's revoked grant or a legal retention restriction.

A stored answer, conversation response, export or summary is itself a derivative disclosure. Its audience cannot exceed what is permitted for the combined evidence; permission to access one cited file does not authorize the rest. Shared publication or onward delivery requires its own current audience/consent check. After withdrawal, stop new cached-answer/context disclosure according to the deletion policy and give clients a restricted/unavailable projection without claiming that old recipients forgot already viewed content.

For streamed answers, choose an explicit reviewed policy: buffer evidence-bearing claims until their required validation passes, or show clearly provisional content only when both it and its sources are currently permitted. Authorization is checked before any byte leaves the boundary; final citation cleanup cannot repair an earlier privacy leak. Persist minimal protected request/evidence/output/audit references for investigation, not raw chain-of-thought, secrets or full document contents in ordinary traces.

Registered read/search/summarize/extract tools use the same domain service as manual requests. `files.request_access` creates a bounded request, not a grant or existence oracle. Share and delete tools require current action authority and exact approval when policy requires it; being able to read a document or execute `files.summarize` does not authorize these mutations. The model cannot replace runtime scope with a different Space ID, raw storage URL or guessed chunk ID.

## 11. Sharing, Replacement, Revocation and Deletion

### C14-W10 Share or Replace Without Expanding Authority Accidentally

Separate ownership, audience, history, classification, Agent delegation and link mechanism. `space_members` is subject to the selected membership/history policy and any narrower object grant; a new member is not automatically entitled to historical files. `selected_members` must refer to eligible authorized accounts. `agent_only` needs a defined human controller/purpose and does not give an Agent independent data rights. `temporary_share` is a bounded access mechanism, not blanket public visibility.

Create a share only after checking the actor's sharing authority, actual source-version scope, eligible recipient, intended purpose, expiry/count limits and required approval. Bind whether it covers one fixed version or explicitly approved future versions; a private replacement must not silently inherit a broad old link. Random tokens are protected credentials: store a suitable digest/verification representation, redact URLs, rate-limit attempts and avoid leak-prone analytics/referrer/logging. Optional passwords are not a substitute for intended-recipient identity, and possession of a link is not account or guardian proof.

Prefer a revocation-aware authorized gateway for the claimed current access policy. A short-lived presigned GET is a bearer capability that usually remains usable until expiry regardless of later membership/share deletion; do not promise immediate revocation from short TTL alone. The selected path must authorize new requests/range requests and bound ongoing transfers under a documented commitment policy, or explicitly obtain product approval for the exposure window. Already delivered/downloaded bytes and requests already in flight cannot be recalled.

Define a logical download/count unit for viewers, retries and multiple range requests, and reserve count-limited access atomically under concurrent use. Prefetch or a link-preview bot must not consume a recipient's allowed access or mutate approval unexpectedly. Authenticated/private viewer responses, metadata and previews use the cache/referrer/content disposition policy appropriate to their sensitivity; never use a public CDN URL merely to make document previews convenient.

Public publication requires explicit audience-expansion authority, eligible clean content, moderation, personal-data review, ownership/copyright basis and indexing/cache policy. Automated scans can flag issues but cannot certify ownership or absence of personal information. Uploaded active HTML/SVG/PDF/Office content is not served with application-origin privileges; use reviewed attachment/sanitized or isolated rendering paths with no ambient account tokens/scripts/network. Thumbnails, EXIF/location metadata, filenames, titles and external link previews can disclose private information too.

A replacement uploads a new immutable version, scans/processes it separately and atomically switches the current logical pointer only when the reviewed publication condition holds. Existing citations keep their exact lineage while permitted; pending jobs continue only under their own eligible generation. Version comparison, sharing, downgrade/rollback and history reads require current authority. Do not blindly reapply every old grant to new sensitive content or leave the old index presenting superseded information as current.

### C14-W11 Revoke Eligibility, Purge Derivatives and Restore Safely

An authorized deletion defines its scope: one source version, the logical file and all versions, one derived artifact/answer, or a wider account/Space request. Recheck ownership, subject/retention obligations and exact target rather than let a file-delete tool wipe every object with a similar key prefix. Cancel/restrict active uploads, pending stages, shares and publication as appropriate. An expired login alone differs from a deleted account or revoked durable processing grant.

Commit a current exclusion/tombstone, share revocation, cancellation epoch and durable deletion/audit work before acknowledging accepted deletion. Query/source/model/preview/download boundaries enforce that exclusion immediately on subsequent authorization decisions, even while physical blobs, index entries and caches are being removed. It may be a 202 pending purge, not a claim that backup/provider copies are already gone. Race-test in-flight page/OCR/embedding/index completion and late upload/queue replay against the tombstone so new derivatives cannot reappear.

Traverse explicit lineage: originals/versions, temporary and multipart uploads, rendered previews, page images, OCR/raw/normalized text, structure/chunks, embeddings/index records, cached snippets/answers, Agent memory/checkpoint references, shares and export/report copies under platform control. Minimal retained audit/dedup data has a separate reviewed purpose/access/expiry; it must not expose deleted document content by default. Content-level dedup requires reference-aware deletion, not global deletion of every equal hash.

Use resumable idempotent purge jobs with per-artifact receipts, failures, retry limits and reconciliation. An object list or old index snapshot alone is not a complete derivative registry. Handle already-missing objects as an expected result while detecting failed access, unavailable keys or wrong generations separately. Do not turn provider-side timeout into proof of erasure, and do not leave an errored purge silently marked complete.

Legal holds and backup/provider retention may delay physical destruction, but ordinary retrieval/Agent access remains excluded and limitations are disclosed under reviewed legal policy. Removing an encryption-key reference is not necessarily cryptographic erasure if shared/wrapped keys, plaintext caches, exports or backups remain. Restore into an isolated environment without outbound model/provider access, replay current tombstones/revocations and reconcile post-snapshot processing before reopening traffic or reindexing. If current authority is unknown, keep the restored data unavailable.

Server-readable encrypted storage with KMS/envelope keys is distinct from true end-to-end encryption. Without authorized plaintext, the server cannot claim ordinary content scanning, OCR, embeddings or RAG. Chapter 19 must select a reviewed mode such as client processing or an explicit narrow plaintext disclosure/participant design; no silent downgrade or automatic provider upload. Account recovery does not necessarily restore encryption keys. These modes and their metadata/retention effects remain open, not resolved by a file status flag.

## 12. Interfaces, Client Experience and Operations

### Source Interface Mapping

All source APIs and tools map once to the groups below. A mapping does not generate endpoint schemas, register a tool or implement a missing command.

| Behavior group | Source APIs | Source Agent tools | Contract |
| --- | --- | --- | --- |
| Upload session/finalize | C14-P01, C14-P02 | None in section 14.17 | C14-W01, C14-W02: exact immutable source, scoped quota/session and durable ingestion receipt. |
| Metadata/list/search | C14-P03, C14-P04, C14-P05 | C14-U01, C14-U02, C14-U03 | C14-W08: bounded current authorized identity/metadata/search, not global filename enumeration. |
| Page/text/preview/table access | C14-P06, C14-P07 | C14-U04, C14-U05, C14-U06, C14-U09 | C14-W05, C14-W06, C14-W09: exact version/generation/anchor with safe projections and supported extraction. |
| Knowledge retrieval/answers | C14-P08, C14-P09 | C14-U08 | C14-W07, C14-W08, C14-W09: approved model processing, authorized bounded evidence and verified citations. |
| Sharing/access requests | C14-P10, C14-P11 | C14-U07, C14-U11 | C14-W10: exact audience/version/expiry and current authority; requesting is not granting. |
| Processing retry | C14-P12 | None in section 14.17 | C14-W04, C14-W12: retry a named eligible operation or explicitly create a new generation, never bypass quarantine. |
| Delete | C14-P13 | C14-U10 | C14-W11: exact deletion scope, immediate eligibility exclusion and truthful asynchronous purge status. |

Missing contracts remain explicit: version upload/list/get/current-pointer changes; downloads/previews and range/count handling; processing manifest/cancellation; access request/permissions/visibility/publication; share consumption/listing; non-page anchors; citation report/open; index generation status and deletion progress. Reconcile Chapter 7 before choosing canonical routes, parameters or job resources. `/pages/{page_number}` and `/text` require an immutable version/generation selector or a response that resolves and binds one; old citations must never depend on an implicit latest pointer.

Use Chapter 7's envelope, typed error projection, exact string sequences, scoped idempotency and representation-aware expected versions. A 201/202 upload or job acceptance is not ready/searchable/clean; 204 has no JSON body. Current authorization precedes old idempotency receipt disclosure. Reject cross-source IDs, unbounded page/date/text requests, unexpected raw URLs and direct status/owner/classification updates. Ordinary clients and Agents do not receive storage keys, provider tokens, raw scanner failures, unredacted DLQ payloads or administrative retry authority.

| Event group | Source events | Required projection |
| --- | --- | --- |
| Transfer/scan | C14-E01, C14-E02, C14-E03, C14-E04 | Exact version, current permitted progress and explicit outcome. Scan-completed is not synonymous with clean; threat details stay restricted. |
| Extraction/structure | C14-E05, C14-E06, C14-E07, C14-E08, C14-E09 | Generation/stage/page identity, bounded progress and coverage, not leaked page text or filenames to an ineligible subscriber. |
| Index/readiness | C14-E10, C14-E11, C14-E12 | Actual published compatible generation/capability state; embeddings-created alone is not a fully searchable file. |
| Failure/deletion | C14-E13, C14-E14 | Safe typed failure/retention/purge state and scoped tombstones; late events cannot revive deleted or superseded content. |
| Shares | C14-E15, C14-E16 | Current authorized grant changes without bearer token leakage; not a raw broadcast to every Space member. |

These sixteen event names need the canonical versioned Chapter 7 envelope and authorized snapshot/replay projection. Object callbacks and queue order are not authoritative file state. Deduplicate by event/effect identity and apply the appropriate resource/generation version; a page finishing out of order does not imply realtime loss. Account/permission changes invalidate stale subscriptions/caches and stop newly disallowed disclosures.

### Client Workflow Mapping

All thirteen Android screens and eleven literal web paths map once below. Equivalent flows share semantics, not platform code or a second routing vocabulary. Reconcile the source root paths with Chapter 9's proposed workspace shell before implementation.

| Client flow | Source Android screens | Source web paths | Required experience |
| --- | --- | --- | --- |
| Browse and find | C14-C01, C14-C07 | C14-H01, C14-H07 | Authorized file/search lists, actual filters/context, honest empty/no-evidence states and no hidden-file counts. |
| Select and transfer | C14-C02, C14-C03 | C14-H02 | Native document picker or accessible web chooser/drop target, per-file progress/cancel, quota/type errors and transfer-versus-processing distinction. |
| Inspect and read | C14-C04, C14-C05, C14-C06 | C14-H03 | Version/generation/classification/coverage-aware viewer, bounded pagination/media navigation, safe previews and accurate source highlighting. |
| Processing/index progress | C14-C08 | C14-H06, C14-H10 | Required/optional stages, processed/failed/pending pages, last update and role-appropriate retry; quarantine is not a normal preview error. |
| Permissions and sharing | C14-C09, C14-C10 | C14-H05 | Current audience, specific share recipient/version/expiry/count, revoke/access-request controls and disclosed download limits. |
| Version history | C14-C11 | C14-H04 | Immutable version comparison/current status, retained cited versions and conflict-aware replacement without silent audience expansion. |
| Ask and open evidence | C14-C12, C14-C13 | C14-H08, C14-H09, C14-H11 | Answer/evidence/uncertainty/coverage, exact source navigation, follow-up and citation report with current access. |

Represent local draft, bytes uploading, finalized-awaiting-scan, scanning, processing/OCR, partial, indexed/ready, failed, quarantined, superseded, revoked/deleted and offline/key-unavailable clearly. Progress percentages need a defined denominator, such as transferred bytes or completed required pages, not a fabricated smooth timer. A retried page can update coverage without restarting the entire UI progress value. Source 'Open-source button' means opening the cited source in this context, not a claim about the file's software license.

Android URI permissions/staging and web File objects/resumability follow the earlier client contracts; reload may require reselecting a local file, and logout/account switch cannot reuse the previous upload or private cache. Cancellation stops the intended transfer/work scope but does not pretend that an in-flight storage request was undone. Persist only approved offline data/commands and make pending versus server-confirmed actions visible. Missing credentials/decryption keys and browser/OS background limitations have explicit recoverable states.

Use the shared restrained operational layout and stable viewer dimensions, typed pickers/menus/toggles, tool icons with names, keyboard/screen-reader/TalkBack navigation, large text and non-color-only status. Drag-and-drop is not the only upload path. Dense PDF pages require zoom/pan plus accessible extracted text where permitted; narrow screens, RTL/mixed scripts, long filenames and large tables must not hide primary controls or the citation context. No user document content enters screenshots/session replay/ordinary telemetry without the reviewed policy.

### C14-W12 Operate, Investigate and Evaluate Under Bounded Load

Run independently controlled workload lanes for validation/scanning, native PDF, OCR/images, Office/media, embeddings, indexing and previews, but avoid creating a mandatory microservice fleet. Choose pool sizes from measured CPU/memory/I/O/provider behavior; the source 1,000 pages, 20 active per document and 4 per worker are examples, not validated settings. Page-job fanout is bounded in admission as well as execution. OCR concurrency may be lower for a measured workload, not because a static number fits every deployment.

Apply global and account/Space quotas for uploads, expanded bytes, pages/pixels/media duration, queued jobs, scratch disk, tokens/provider spend, index storage and active processes. Interactive preview/retrieval can have a reviewed priority lane without allowing a user to self-assign unlimited urgent jobs or bypass scan/authorization. Backpressure produces explicit retry/deferred/partial status, protects interactive APIs/scheduling and prevents memory growth; do not load whole documents into request handlers while waiting for workers.

Classify transient storage/provider faults, deterministic corrupt input, malware, unsupported/encrypted content, low-quality OCR and current revocation separately. Use bounded retries with stable logical identity, timeout/cost limits, cancellation and compatible generation/version checks. A protected DLQ stores safe structured diagnostics and references, not full sensitive text or signed URLs. Case-scoped operators can inspect permitted failures; retry/resolution is audited, reauthorized and cannot relabel malware as clean. A new extractor/model means an explicit compatible new generation, not an in-place repair of old evidence.

Observe queue age, stage/page latency, bytes/pages/coverage, scan freshness/failure, parser crashes/resource limits, model/index lag, authorized retrieval latency and quality, cache eligibility failures, deletion lag and actual cost. Keep metrics bounded and omit filenames/text/contact details/tokens/queries from ordinary labels/logs. Mandatory access/share/delete/operator audit is distinct from optional traces and records the necessary actual actor/context/action/result without leaking content. Secure build/dependency and isolated worker updates follow Chapter 10/11 with compatibility and rollback gates.

Evaluate the real selected components in an isolated synthetic environment before a dependent feature releases: scan gate, parser/preview sandbox and malicious-format fixtures, large/partial/reordered documents, supported languages/layouts, retrieval recall/ranking/support/abstention and current-access races. Mocks or static arithmetic can test expected contracts but cannot prove real parser isolation, official provider handling or hybrid-search quality. Track exact fixture/artifact/library/model/tz-independent configuration versions, faults, failures/skips and agreed thresholds; observed critical disclosure or unsupported-citation failures block the affected release rather than disappear into an average score.

Backup/restore and disaster recovery require coherent object versions, database generations, indexes, keys and current privacy/deletion evidence. Rebuild indexes from eligible authoritative data, not from whichever blobs are discoverable in a restored bucket. Test broker loss after durable acceptance, worker crashes, drain/upgrade, object unavailability, provider outage and post-snapshot revocation before claiming RPO/RTO or availability. No live documents, uploads, model evaluations, scanners or infrastructure were used to write this draft.

## 13. Proposed Verification and Synthetic Lineage Fixture

The following thirty-two evidence families refine the source acceptance/security lists. Every application/storage/parser/scanner/OCR/index/model/browser/device test is NOT RUN. Each family can require many positive, negative and fault cases; these rows are not a count of passing tests or a certification.

| ID | Verification family and required evidence | Traceability |
| --- | --- | --- |
| C14-V01 | Ownership and source records: private default, actual owner/parent/history constraints, same-version derivative relationships, forged IDs/statuses and cross-account hash/existence leakage. | C14-S01, C14-S02, C14-S03; C14-F01, C14-F02, C14-F03; C14-A06; C14-Q09; C14-K01, C14-K08; C14-W01 |
| C14-V02 | Client upload admission: Android/web selection, concurrent quota reservations, scoped expiring presigned capabilities, actual provider constraints, multipart/abandon/logout behavior and no permanent credentials. | C14-S04, C14-S24, C14-S25; C14-F04; C14-A01, C14-A02; C14-Q01; C14-K01, C14-K02; C14-W01 |
| C14-V03 | Immutable completion: size/digest/version checks, late PUT after scan/cancel, object/database failure boundaries, repeated or mismatched complete and orphan reconciliation cannot replace accepted bytes or duplicate a version. | C14-S03, C14-S04, C14-S19; C14-F13; C14-A03, C14-A04; C14-K02, C14-K05; C14-W02 |
| C14-V04 | Hostile validation/archive corpus: spoofed signatures/MIME, malformed/password-protected/polyglot input, traversal/path collisions/links and actual decompression/nesting/entry/resource bounds using the selected libraries. | C14-S05, C14-S09, C14-S27; C14-A03, C14-A04; C14-Q02, C14-Q05, C14-Q06; C14-K03, C14-K04; C14-W03 |
| C14-V05 | Scan gate: pending/threat/unavailable/unsupported/stale verdict and checksum/version mismatch never publish to preview/parser/search/Agent; record actual engine/signature version and current lifecycle at release. | C14-S06, C14-S28; C14-F05; C14-A05; C14-Q03; C14-K02, C14-K03; C14-W03 |
| C14-V06 | Real parser/renderer isolation: filesystem/process/secret/egress boundaries, CPU/memory/time/disk limits, external entities/embedded links/macros/scripts and malformed active content; clean scan cannot bypass the sandbox. | C14-S05, C14-S07, C14-S09, C14-S27, C14-S28; C14-A23; C14-Q04, C14-Q07, C14-Q08; C14-K04, C14-K16; C14-W03, C14-W04 |
| C14-V07 | Durable stage jobs: crash before/after result-next-work-outbox commit, lost broker publish, concurrent claims, stale lease, wrong version/configuration and deletion races preserve one eligible logical result. | C14-S07, C14-S08, C14-S22; C14-F06, C14-F16; C14-K05, C14-K08; C14-W04 |
| C14-V08 | Page manifest and coverage: out-of-order/duplicate/page-gap completion, 1-versus-10 numeric order, invalid page identity, optional/required stages and bounded fanout produce truthful partial or complete snapshots. | C14-S08, C14-S22, C14-S23; C14-F06, C14-F09; C14-A07, C14-A08; C14-K05, C14-K06; C14-W04, C14-W06 |
| C14-V09 | Native/OCR decision and provenance: usable native, mixed text/scanned regions, empty/poor/rotated pages, explicit OCR, language failures and missing/noncomparable confidence avoid duplicate text and fabricated certainty. | C14-S09, C14-S10; C14-F07, C14-F08; C14-A09, C14-A10; C14-K07; C14-W05 |
| C14-V10 | Meaning-preserving normalization: minus/decimal/currency/units/date/qualifier/table/header and mixed-script fixtures preserve meaning, raw-to-normalized/redacted spans and reviewable uncertainty without confirming medical instructions. | C14-S10, C14-S11, C14-S12; C14-A10; C14-Q14; C14-K07, C14-K08; C14-W05 |
| C14-V11 | Released media/Office anchors: real parser/codec/layout capabilities, duration/pixel/decompression bounds, sheet/slide/cell/time/region provenance and safe preview isolation; no invented pages or implicit transcription-provider grant. | C14-S01, C14-S09, C14-S12, C14-S28; C14-K04, C14-K07, C14-K08; C14-W04, C14-W05 |
| C14-V12 | Structure-aware chunks: heading/paragraph/table/continuation/overlap/token limits, multi-page spans, configuration changes and same-source constraints preserve exact lineage and do not broaden source permissions. | C14-S12, C14-S13; C14-A11; C14-K06, C14-K07, C14-K08; C14-W06 |
| C14-V13 | Async embedding privacy and budgets: source/query classification, provider/local processing approval, model/dimension/metric identity, timeout/retry, costs and deleted sources prevent unauthorized disclosure or mixed vector spaces. | C14-S13, C14-S14, C14-S28; C14-A12; C14-K05, C14-K08, C14-K09, C14-K16; C14-W07 |
| C14-V14 | Index generation publication: incomplete/stale index writes, external-service failure, compatible model/chunk migration, atomic pointer switch and rollback cannot expose retired/deleted content or advertise missing required coverage. | C14-S14, C14-S19, C14-S22; C14-K06, C14-K08, C14-K09, C14-K15; C14-W07 |
| C14-V15 | Hybrid retrieval quality: actual supported language/exact-ID/phrase/date/currency and semantic fixtures measure keyword/vector recall and ranking, with explicit query/index model compatibility and bounded latency. | C14-S14, C14-S15, C14-S28; C14-F10; C14-A13; C14-K09, C14-K11; C14-W08 |
| C14-V16 | Authorization before disclosure: current membership/history/grant/consent/classification/delegation, copied-ACL staleness, hidden-file metadata/counts, cached answers and revocation races across candidates/rerankers/models/previews. | C14-S14, C14-S15, C14-S17, C14-S27; C14-F11, C14-F17; C14-A14, C14-A15; C14-Q11, C14-Q12, C14-Q15, C14-Q16, C14-Q19; C14-K01, C14-K10, C14-K15; C14-W08, C14-W09, C14-W11 |
| C14-V17 | Filtered ANN and ranking behavior: actual engine filter placement/recall, bounded protected fallback, safe score fusion, deduplication and cross-version/conflicting evidence cannot weaken authorization to improve recall. | C14-S14, C14-S15; C14-A13, C14-A14; C14-K09, C14-K10, C14-K11; C14-W08 |
| C14-V18 | Context and abstention: candidate/per-document/sensitive/token/time/cost budgets, reserved prompt/output space, no-evidence versus partial/conflicting sources and account-isolated cache identity do not produce unqualified unsupported answers. | C14-S15; C14-K10, C14-K11, C14-K13; C14-W08, C14-W09 |
| C14-V19 | Exact citations: source/version/generation/chunk/anchor identity, physical versus printed pages, Unicode offset units/bounds, normalization/rotation/geometry mapping and current source open; reject nonexistent or substituted references. | C14-S16; C14-F12; C14-A16, C14-A17; C14-Q20; C14-K07, C14-K08, C14-K12; C14-W09 |
| C14-V20 | Claim support: relevant evidence rather than merely a real citation, negative/dated/table-qualified statements, structured arithmetic, conflicting/partial sources, answer uncertainty and streamed/stored derivative audience. | C14-S15, C14-S16; C14-F18; C14-A16; C14-K10, C14-K11, C14-K12, C14-K13; C14-W09 |
| C14-V21 | Agent tools and hostile text: scope-changing parameters, embedded instructions/URLs/memory directives, arbitrary raw object IDs and unauthorized share/delete/access requests cannot escape registered domain policy or MVP health restrictions. | C14-S17, C14-S27; C14-F15; C14-A15; C14-Q16; C14-K01, C14-K10, C14-K13, C14-K14; C14-W08, C14-W09, C14-W10 |
| C14-V22 | Shares and revocation: fixed/future-version audience, recipient binding, expiry, protected token/password handling, concurrent count/range/prefetch behavior and actual gateway capability revocation limits are demonstrated. | C14-S18; C14-A19; C14-Q10, C14-Q17; C14-K01, C14-K14, C14-K15; C14-W10 |
| C14-V23 | Public and active-content preview: explicit audience expansion, scan/moderation/privacy/ownership checks, app-origin/script/URL/metadata/cache protections and no private storage-path or filename leakage. | C14-S05, C14-S18, C14-S27; C14-F03, C14-F17; C14-A06; C14-Q07, C14-Q08, C14-Q09, C14-Q15; C14-K03, C14-K04, C14-K14; C14-W03, C14-W10 |
| C14-V24 | Version replacement/history: new processing while old remains current, atomic reviewed switch, stale-worker rejection, explicit grant inheritance, historical citations and conflict-aware comparison/rollback under current rights. | C14-S19; C14-F13; C14-A18; C14-Q20; C14-K02, C14-K08, C14-K09, C14-K12, C14-K14; C14-W02, C14-W07, C14-W09, C14-W10 |
| C14-V25 | Deletion lineage and late work: immediate query/source exclusion, precise version/file scope, all derivatives/memory/caches/shares, in-flight uploads/jobs/indexing, reference-aware dedup and resumable purge evidence. | C14-S20; C14-F14; C14-A20; C14-Q18, C14-Q19; C14-K05, C14-K08, C14-K15; C14-W11 |
| C14-V26 | Retention, encryption and restore: legal/provider/backup limits, key custody/loss and E2E plaintext boundaries; restored objects/indexes remain excluded until current revocations/deletions and post-snapshot effects reconcile. | C14-S03, C14-S20, C14-S27, C14-S28; C14-F17; C14-Q13, C14-Q18; C14-K01, C14-K08, C14-K15, C14-K16; C14-W11, C14-W12 |
| C14-V27 | Retry and investigation: transient versus deterministic/quarantined/unsupported faults, bounded attempts/budgets, protected DLQ, case-scoped operator retry, compatible new generations and audit; no manual bypass of required controls. | C14-S22; C14-F16; C14-A21; C14-K03, C14-K04, C14-K05, C14-K16; C14-W04, C14-W12 |
| C14-V28 | API compatibility: thirteen source operations plus approved gaps, immutable selectors, typed scope/version/idempotency/envelopes/errors and bounded reads; duplicate receipt cannot disclose revoked content. | C14-S04, C14-S26; C14-K01, C14-K02, C14-K12, C14-K16; C14-W01, C14-W02, C14-W09, C14-W10, C14-W11 |
| C14-V29 | Realtime/replay: sixteen event meanings, generation/resource versions, scan outcome/readiness distinctions, partial out-of-order progress, authorized snapshot/barrier and revocation/account-switch behavior. | C14-S21; C14-K03, C14-K05, C14-K06, C14-K16; C14-W04, C14-W06, C14-W12 |
| C14-V30 | Client parity/accessibility: thirteen Android screens and eleven web paths, picker/drop alternative, long names/large pages/RTL/mixed scripts, zoom/screen readers, exact citations, partial/offline/key-loss and account isolation. | C14-S24, C14-S25; C14-A01, C14-A17; C14-K06, C14-K12, C14-K14, C14-K16; C14-W01, C14-W06, C14-W09, C14-W10 |
| C14-V31 | Load and private operations: real bytes/pages/pixels/scratch/CPU/queue/cost bounds, priority fairness, saturation and model outage protect interactive requests/scheduling; access/share audit and log canaries prove no sensitive content leakage. | C14-S07, C14-S23, C14-S27, C14-S28; C14-F09; C14-A22, C14-A24, C14-A25; C14-Q17; C14-K04, C14-K05, C14-K11, C14-K16; C14-W04, C14-W07, C14-W12 |
| C14-V32 | Authorized synthetic end-to-end file journey: upload/scan/page result/chunk/index/query/cited source, changed version, denied account, partial failure/retry and revoke/delete across Android/core web using exact artifacts and observed evidence. | C14-S01, C14-S02, C14-S29, C14-S30; C14-K01, C14-K02, C14-K03, C14-K08, C14-K10, C14-K12, C14-K15, C14-K16; C14-W01, C14-W02, C14-W03, C14-W04, C14-W05, C14-W06, C14-W07, C14-W08, C14-W09, C14-W10, C14-W11, C14-W12 |

### Synthetic Lineage and Offset Fixture

This JSON is documentation, not a production schema, scanner sample, search corpus or runtime test. It has three finite groups: ordered page coverage, a retained version-bound citation with explicit Unicode offsets, and hypothetical candidate eligibility flags. The mathematical supplementary character and combining mark are intentional offset controls encoded as ASCII JSON escapes. They are not meaningful document instructions.

```json
{
	"fixture_kind": "synthetic_document_lineage",
	"runtime_executed": false,
	"page_manifest": {
		"source_version": "synthetic-version-1",
		"generation": "synthetic-extraction-1",
		"expected_pages": [1, 2, 3],
		"completed_arrival_order": [3, 1, 2],
		"expected_source_order": [1, 2, 3],
		"missing_page_control": {
			"completed_pages": [3, 1],
			"expected_missing_pages": [2],
			"expected_complete": false
		}
	},
	"citation": {
		"file_id": "synthetic-budget-file",
		"cited_source_version": "synthetic-version-1",
		"cited_generation": "synthetic-extraction-1",
		"page_number": 3,
		"current_file_version": "synthetic-version-2",
		"retained_cited_version_authorized": true,
		"canonical_text": "A\ud835\udc00 e\u0301 budget 12500.",
		"offset_unit": "unicode_scalar_value",
		"interval": "zero_based_end_exclusive",
		"quote_start": 6,
		"quote_end": 19,
		"expected_quote": "budget 12500.",
		"expected_utf16_start": 7,
		"expected_utf16_length": 13,
		"expected_open_version": "synthetic-version-1",
		"invalid_end_control": 50,
		"substituted_version_control": "synthetic-version-2"
	},
	"candidate_gate": {
		"candidates": [
			{ "id": "synthetic-allowed", "actor_allowed": true, "scan": "clean", "deleted": false, "generation_published": true },
			{ "id": "synthetic-private", "actor_allowed": false, "scan": "clean", "deleted": false, "generation_published": true },
			{ "id": "synthetic-quarantine", "actor_allowed": true, "scan": "quarantined", "deleted": false, "generation_published": true },
			{ "id": "synthetic-deleted", "actor_allowed": true, "scan": "clean", "deleted": true, "generation_published": true },
			{ "id": "synthetic-unpublished", "actor_allowed": true, "scan": "clean", "deleted": false, "generation_published": false }
		],
		"expected_eligible_ids": ["synthetic-allowed"],
		"provider_calls_executed": 0
	}
}
```

A documentation check can parse the fixture, sort its page numbers, detect its missing page, translate its scalar offsets to UTF-16 indices, compare the exact quote and reject out-of-range/substituted-version controls. It can evaluate the explicitly supplied eligibility flags for internal consistency. Those flags are assumed inputs, not implemented authorization, and the result does not test SQL/ANN filtering, scanning, actual PDF geometry, model claim support, caches or revocation races. Actual C14-V08, C14-V16 and C14-V19 evidence must exercise the selected runtime and independent ground truth.

## 14. Developer Handoff and Delivery Sequence

These responsibility packages are not twelve mandatory processes, developers or running Agents. Design can proceed now; implementation prerequisites and runtime evidence apply only when that work is authorized. Conditional media, OCR, external-model, public-share and care capabilities do not become the first file-demo requirements merely by appearing in a package.

| ID | Owner | Depends on | Deliverable and acceptance |
| --- | --- | --- | --- |
| C14-T01 | Product, file, privacy and security leads | Relevant release/data/API/identity/Space/security decisions | Resolve released formats/audiences and C14-D01 through C14-D14, model-processing/encryption/retention limits, evidence definitions and budgets. Never turn source examples into approved numerical defaults. |
| C14-T02 | Domain/data/storage engineer | C14-T01 | Define immutable source/derivative/generation identities, ownership, manifests, lifecycle and relational constraints; design stable version/citation/deletion lineage for C14-V01, C14-V03, C14-V08, C14-V24, C14-V25. |
| C14-T03 | Upload/storage engineer | C14-T02; selected storage capability review | Implement scoped sessions/quotas, actual-provider presigning and immutable completion with receipt/outbox/orphan reconciliation; C14-V02 through C14-V04. No permanent client credentials or mutable scanned object. |
| C14-T04 | Security/worker platform engineer | C14-T02, C14-T03 | Implement quarantine, tested scanner verdict binding, maintained parser sandbox/egress/resource boundaries and compatible releases; C14-V04 through C14-V06. A container definition alone is not the acceptance artifact. |
| C14-T05 | Extraction/OCR/media engineer | C14-T02, C14-T04 | Implement only supported bounded stage/page paths, ordered coverage, quality/normalization/structure/chunk mapping and necessary media anchors; C14-V07 through C14-V12. Record actual parser/OCR versions and limits. |
| C14-T06 | Search/embedding engineer | C14-T01, C14-T02, C14-T05 | Implement approved embedding/index generations, model-compatible publication and authorized hybrid search with bounded ranking/evaluation; C14-V13 through C14-V18. No provider disclosure without its gate. |
| C14-T07 | Agent/evidence engineer | C14-T05, C14-T06; accepted Agent runtime | Implement minimum authorized evidence, registered tools, claim support, exact citation/offset/geometry handling and abstention; C14-V19 through C14-V21. No raw storage or scope override. |
| C14-T08 | Sharing/privacy/retention engineer | C14-T02, C14-T03, C14-T04, C14-T06 | Implement precise shares/current revocation path, version-audience rules, public gates if released and resumable deletion/restore lineage; C14-V22 through C14-V26. Distinguish in-flight/download/provider/backup limits. |
| C14-T09 | API, Android and web engineers | C14-T03, C14-T05, C14-T06, C14-T07, C14-T08 for released scope | Reconcile version/derivative selectors and missing operations, then implement typed APIs/events/client flows and accessible exact-source navigation; C14-V28 through C14-V30. |
| C14-T10 | Operations/platform engineer | C14-T03, C14-T04, C14-T05, C14-T06, C14-T08 | Implement measured admission/worker/provider budgets, private audit/metrics, safe DLQ/upgrade/restore and kill switches; C14-V26, C14-V27, C14-V31. Keep reminders/core APIs isolated from heavy file work. |
| C14-T11 | Independent QA, security and retrieval reviewers | C14-T02 through C14-T10 for released scope | Execute applicable C14-V01 through C14-V32 with exact synthetic artifacts, versions, provider/simulator identity, faults and measured thresholds. Separate document checks, mocks, component tests and end-to-end quality evidence. |
| C14-T12 | Community, moderation, product and privacy leads | C14-T01, C14-T08, C14-T09; C14-T11 for implemented file evidence | Chapter 15 handoff: public/community content/media publication, permissions, moderation and cache/search removal must honor immutable file lineage and current audience. Design proceeds without assuming this pipeline has passed runtime gates. |

An authorized first file slice can proceed from exact source identity and current grants to scoped PDF upload, quarantine/scan, one maintained native extractor, ordered chunks, approved hybrid retrieval and a verifiable source viewer. Add OCR/mixed languages, richer media, public shares and external models only with the relevant gates and evidence. A model-less file/search path remains useful; enabling RAG still requires a separately approved model-processing and evaluation path.

## 15. Demonstration, Remaining Risks and Next Chapter

### Separate Synthetic File Demonstration

This is a future file/retrieval demo, not an amendment to the ordinary-reminder M1 or a report of an executed system. Use a deliberately authored synthetic document, synthetic accounts, approved dependencies and isolated providers/simulators only when implementation and testing are authorized.

1. Create an ordinary private Space with an intended permitted reader and a denied account; upload a bounded synthetic native-text PDF through the scoped session. Record the actual verified immutable version/digest.
2. Show uploaded/pending scan, then the exact scan result. Hold a separate unscanned/quarantined control out of previews, parsers, search and Agent access without exposing unsafe content to clients.
3. Execute bounded page jobs out of order and collect by physical source page. Force one required page failure and show its gap and partial search coverage, not an incorrect Ready state.
4. Retry the same eligible logical page operation and demonstrate one accepted result; reprocessing with a different configuration creates a new generation. Restart a worker or lose a queue publish to prove durable recovery.
5. Publish compatible authorized chunks/indexes and query a known literal fact plus a semantic paraphrase under the approved search/model mode. Distinguish zero evidence, partial evidence and supported answers.
6. Open a cited passage at its exact retained version/page/anchor and verify quote/geometry. Introduce a real reference with an unsupported claim as a control; citation existence alone must not pass answer validation.
7. Upload a changed version, finish its gate and switch current publication. New search uses the intended current generation; old citations never silently open changed text and remain readable only while authorized/retained.
8. Revoke a selected share or recipient grant and attempt preview, download, search, rerank/context, cached answer and citation access. Document the selected path's in-flight/download limits rather than claim recall.
9. Delete the synthetic source under its explicit scope; verify current exclusion before asynchronous purge and exercise a late stage/index event. Track every platform-controlled derivative and pending cleanup result.
10. Check Android/core-web state parity, reconnect/account switch, keyboard/assistive navigation and partial/failed/offline states. Capture actual safe audit/receipt/generation evidence, not just successful screenshots or a model's assurance.

Record expected versus observed bytes/version/generation/coverage, actor/context, fault point, candidate/evidence manifest, citation validation, attempted versus actual provider calls and relevant build/library/model/configuration versions. Keep synthetic artifacts reproducible and ordinary logs free of content/secrets. A successful narrow demonstration does not certify all formats/languages, malware detection, sandbox security, legal/copyright compliance, E2E compatibility or production retrieval quality.

### Open Boundaries

- The seven PROPOSED and seven OPEN choices remain unapproved. Canonical source/processing/index states, version-aware API selectors, non-page anchors and the web routing placement must be resolved before implementations diverge.
- Immutable object/version commitment depends on actual storage semantics. Scanner verdict freshness, parser licenses/patches/isolation, supported languages/formats and hard resource limits need measured component evidence; source tables are not an installed toolchain.
- Current authorization is required before external processing or disclosure, including embeddings/rerankers/query models, snippets/metadata, answer caches and derived summaries. No prompt instruction, vector namespace, copied ACL or blocked final tool call repairs earlier leakage.
- Source citation offsets lack a unit and source version; the proposed scalar/end-exclusive and generation-bound model needs client/library tests. Page-centric examples require honest typed anchors for reflowing documents, sheets and media rather than fabricated pages.
- Temporary shares and public caches have real bearer/in-flight/download exposure limits. True E2E plaintext availability, sensitive care/guardian authority, legal holds and provider/backup deletion remain separate decisions; no silent weakening of the earlier security or MVP Agent boundaries.
- Known critical scan bypass, unauthorized disclosure, invalid source substitution or deletion resurrection blocks the affected release. Unrun tests and absent retrieval-quality evidence are not passes, and a residual-risk sign-off cannot waive mandatory permissions or legal duties.

Next is [Chapter 15](Chapter15.md): public community/page discovery, content publication and interaction workflows, using these file/media/privacy boundaries. Carry [Chapter 16](Chapter16.md) for moderation/trust operations, [Chapter 19](Chapter19.md) for encryption and [Chapter 20](Chapter20.md) for notification delivery. Continue design and developer handoff, preserving source conflicts and open decisions without inferring implementation authorization.