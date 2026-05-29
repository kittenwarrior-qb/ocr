"""OCR queue với N worker threads chạy song song — tránh rate limit bằng OCR_CONCURRENCY."""
import logging
import queue
import threading
from uuid import UUID

logger = logging.getLogger(__name__)

_q: queue.Queue = queue.Queue()
_workers: list[threading.Thread] = []
_lock = threading.Lock()


def _worker(worker_id: int):
    from app.database import SessionLocal
    from app.services import document_service

    while True:
        item = _q.get()
        if item is None:
            _q.task_done()
            break
        # item is (raw_doc_id, use_ai)
        raw_doc_id, use_ai = item
        db = SessionLocal()
        try:
            document_service.process_raw_document(db, raw_doc_id, use_ai=use_ai)
        except Exception as e:
            logger.error("OCR worker-%d error for %s: %s", worker_id, raw_doc_id, e)
        finally:
            db.close()
            _q.task_done()


def start(concurrency: int = 3):
    global _workers
    with _lock:
        # Dừng workers cũ nếu có
        for _ in _workers:
            _q.put(None)
        _workers = []
        for i in range(max(1, concurrency)):
            t = threading.Thread(target=_worker, args=(i,), daemon=True, name=f"ocr-worker-{i}")
            t.start()
            _workers.append(t)
        logger.info("OCR queue started with %d worker(s)", concurrency)


def enqueue(raw_doc_id: UUID, use_ai: bool = True):
    _q.put((raw_doc_id, use_ai))


def pending() -> int:
    return _q.qsize()


def worker_count() -> int:
    return sum(1 for t in _workers if t.is_alive())
