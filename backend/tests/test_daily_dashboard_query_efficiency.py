from datetime import date
from types import SimpleNamespace

from app.routers import reports


class BranchRowsQuery:
    def filter(self, *args):
        return self

    def all(self):
        return [(11,), (12,)]


class BranchRowsDB:
    def query(self, *args):
        return BranchRowsQuery()


def test_daily_dashboard_resolves_admin_branch_scope_once():
    user = SimpleNamespace(role="admin", business_id=7, branch_id=11)

    assert reports._daily_dashboard_branch_ids(BranchRowsDB(), user, None) == [
        11,
        12,
    ]


def test_daily_dashboard_uses_permitted_resolved_branch():
    user = SimpleNamespace(role="admin", business_id=7, branch_id=11)

    assert reports._daily_dashboard_branch_ids(BranchRowsDB(), user, 12) == [12]


def test_daily_dashboard_rejects_cross_business_resolved_branch():
    user = SimpleNamespace(role="admin", business_id=7, branch_id=11)

    assert reports._daily_dashboard_branch_ids(BranchRowsDB(), user, 99) == [
        11,
        12,
    ]


def test_daily_dashboard_keeps_superadmin_all_branch_scope_unbounded():
    user = SimpleNamespace(role="superadmin", business_id=None, branch_id=None)

    assert reports._daily_dashboard_branch_ids(None, user, None) is None
    assert reports._daily_dashboard_branch_ids(None, user, 12) == [12]


def test_dashboard_chart_always_describes_seven_days(monkeypatch):
    class ResultQuery:
        def __init__(self, rows=None):
            self.rows = rows or []

        def filter(self, *args):
            return self

        def group_by(self, *args):
            return self

        def join(self, *args):
            return self

        def all(self):
            return self.rows

        def scalar(self):
            return 0

    class ResultDB:
        def __init__(self):
            self.query_count = 0

        def query(self, *args):
            self.query_count += 1
            if self.query_count == 1:
                return ResultQuery([(11,)])
            return ResultQuery()

    monkeypatch.setattr(reports, "_resolve_branch", lambda user, branch_id: 11)
    user = SimpleNamespace(role="admin", business_id=7, branch_id=11)
    db = ResultDB()

    result = reports.daily_dashboard(branch_id=11, db=db, user=user)

    assert len(result["chart"]["labels"]) == 7
    assert len(result["chart"]["datasets"][0]["data"]) == 7
    assert result["chart"]["labels"][-1] == date.today().isoformat()
    assert db.query_count == 4
