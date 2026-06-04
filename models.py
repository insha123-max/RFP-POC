from pydantic import BaseModel
from typing import Optional, List


class SubCriterion(BaseModel):
    criterion: str
    max_marks: float
    mandatory: bool = False


class ScoringCategory(BaseModel):
    category: str
    max_marks: float
    weight_percent: float
    subcriteria: List[SubCriterion] = []


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
    mandatory_disqualifiers: List[str] = []


class CriterionEvaluation(BaseModel):
    criterion: str
    category: str
    max_marks: float
    marks_awarded: float = 0.0
    vendor_claim: str
    source_reference: str
    compliance_status: str  # "Met", "Partial", "Not Met"
    confidence: str  # "High", "Medium", "Low"
    justification: str
    is_mandatory: bool = False


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


class DisqualifierCheck(BaseModel):
    condition: str
    met: bool
    note: str = ""


class RiskItem(BaseModel):
    risk_area: str
    severity: str  # "High", "Medium", "Low"
    description: str


class EvaluationReport(BaseModel):
    total_score: float
    max_score: float
    threshold: float
    passed: bool
    disqualified: bool
    disqualification_reason: Optional[str] = None
    category_results: List[CategoryResult]
    disqualifier_checks: List[DisqualifierCheck] = []
    risk_items: List[RiskItem] = []
    executive_summary: str
    rules: EvaluationRules


class OverrideEntry(BaseModel):
    category: str
    criterion: str
    new_marks: float
    reason: str = ""


class OverrideRequest(BaseModel):
    report: EvaluationReport
    overrides: List[OverrideEntry]
