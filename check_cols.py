from app.database import engine
from sqlalchemy import inspect, text

insp = inspect(engine)
cols = [c['name'] for c in insp.get_columns('processed_orders')]
print('Current columns:', cols)

# Add extra_data column if not exists
if 'extra_data' not in cols:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE processed_orders ADD COLUMN extra_data JSONB DEFAULT '{}'::jsonb"))
        conn.commit()
    print('Added extra_data column')
else:
    print('extra_data already exists')
