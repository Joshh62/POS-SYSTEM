from app.models import AuditLog
from datetime import datetime

def log_action(db, user_id, action, table, record_id=None, description=None):

    log = AuditLog(
        user_id=user_id,
        action=action,
        table_name=table,
        record_id=record_id,
        description=description,
        created_at=datetime.utcnow()
    )

    db.add(log)
    db.commit()