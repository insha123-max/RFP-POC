from pydantic import BaseModel
from typing import Optional, List


class SubCriterion(BaseModel):
    criterion: str
    max_marks: float


class ScoringCategory(BaseModel):
    category: str
    max_marks: float
    weight_percent: float
    subcriteria: List[SubCriterion] = []
    qualification_type: str = ""  # "PQ", "TQ", or "" for standard evaluations


class CategoryMinimum(BaseModel):
    category: str
    minimum_percent: float


class Threshold(BaseModel):
    overall_pass_mark: float
    category_minimums: List[CategoryMinimum] = []


class EvaluationRules(BaseModel):
    rules_found: bool = True
    scoring_categories: List[ScoringCategory] = []
    threshold: Threshold = Threshold(overall_pass_mark=0)


class CriterionEvaluation(BaseModel):
    criterion: str
    category: str
    max_marks: float
    marks_awarded: float = 0.0
    vendor_claim: str
    source_reference: str
    compliance_status: str  # "Met", "Not Met"
    confidence: str  # "High", "Medium", "Low"
    justification: str
    threshold_logic: str = ""  # "RFP Min (X%)" or "50% Fallback"
    qualification_type: str = ""  # "PQ", "TQ", or "" for standard evaluations


class CategoryResult(BaseModel):
    category: str
    max_marks: float
    marks_awarded: float
    percent_achieved: float
    weight_percent: float
    weighted_score: float
    passed: bool
    minimum_required: Optional[float] = None
    criteria: List[CriterionEvaluation] = []
    qualification_type: str = ""  # "PQ", "TQ", or "" for standard evaluations


class RiskItem(BaseModel):
    risk_area: str
    severity: str  # "High", "Medium", "Low"
    description: str


class PrebidQA(BaseModel):
    question: str
    answer: str


class EvaluationReport(BaseModel):
    total_score: float
    max_score: float
    threshold: float
    passed: bool
    disqualified: bool
    disqualification_reason: Optional[str] = None
    category_results: List[CategoryResult]
    risk_items: List[RiskItem] = []
    executive_summary: str
    rules: EvaluationRules
    prebid_qa: List[PrebidQA] = []
    prebid_applied: bool = False


class ChecklistItem(BaseModel):
    id: str
    type: str           # "PQ" or "TQ"
    category: str
    criterion: str      # plain-English requirement
    detail: str         # fuller explanation
    max_score: float = 0.0   # 0 for PQ items
    is_mandatory: bool = False


class BidReadinessResult(BaseModel):
    pq_items: List[ChecklistItem]
    tq_items: List[ChecklistItem]
    total_tq_score: float


class OverrideEntry(BaseModel):
    category: str
    criterion: str
    new_marks: float
    reason: str = ""


class OverrideRequest(BaseModel):
    report: EvaluationReport
    overrides: List[OverrideEntry]
