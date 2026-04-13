"""
scheduler.py
------------
Lightweight scheduler using asyncio — no external packages needed.
Runs the WhatsApp daily report every day at 8PM Lagos time.
"""

import asyncio
from datetime import datetime
import pytz

LAGOS_TZ = pytz.timezone("Africa/Lagos")


def seconds_until_8pm() -> float:
    """Calculate seconds until next 8PM Lagos time."""
    now = datetime.now(LAGOS_TZ)
    target = now.replace(hour=20, minute=0, second=0, microsecond=0)

    # If 8PM already passed today, schedule for tomorrow
    if now >= target:
        target = target.replace(day=target.day + 1)

    delta = (target - now).total_seconds()
    return delta


async def daily_report_loop():
    """Infinite loop that fires the WhatsApp report every day at 8PM."""
    while True:
        wait_seconds = seconds_until_8pm()
        hours = int(wait_seconds // 3600)
        minutes = int((wait_seconds % 3600) // 60)
        print(f"[Scheduler] Next WhatsApp report in {hours}h {minutes}m")

        await asyncio.sleep(wait_seconds)

        # Run the report
        try:
            from app.database import SessionLocal
            from app.whatsapp_report import send_whatsapp_report
            db = SessionLocal()
            try:
                send_whatsapp_report(db)
                print("[Scheduler] Daily WhatsApp report sent successfully")
            finally:
                db.close()
        except Exception as e:
            print(f"[Scheduler] Failed to send report: {e}")

        # Wait 60 seconds before recalculating to avoid re-firing immediately
        await asyncio.sleep(60)


def start_scheduler():
    """Start the scheduler as a background asyncio task."""
    loop = asyncio.get_event_loop()
    loop.create_task(daily_report_loop())
    print("[Scheduler] Started — daily WhatsApp report at 8:00 PM Lagos time")