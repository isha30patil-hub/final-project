"""Pydantic schemas for structured AI outputs: test-case generation,
coverage validation, and failure analysis."""

from typing import Optional
from pydantic import BaseModel, Field


class TestStep(BaseModel):
    step: int
    action: str
    expected_result: str = ""


class Automation(BaseModel):
    automatable: bool = False
    requires_credentials: bool = False
    requires_user_input: bool = False


class Security(BaseModel):
    security_relevance: bool = False
    risk: Optional[str] = None


class AITestCase(BaseModel):
    id: Optional[str] = None
    title: str
    module: str = "General"
    feature: Optional[str] = None
    priority: Optional[str] = None
    severity: Optional[str] = None
    type: Optional[str] = None
    category: Optional[str] = None
    role: Optional[str] = None
    preconditions: list[str] = Field(default_factory=list)
    test_data: dict = Field(default_factory=dict)
    steps: list[TestStep] = Field(default_factory=list)
    expected_final_state: Optional[str] = None
    automation: Automation = Field(default_factory=Automation)
    security: Security = Field(default_factory=Security)
    tags: list[str] = Field(default_factory=list)

    # Legacy flat fields kept so both the original and the new prompt shape validate.
    steps_text: Optional[str] = None
    expected_result: Optional[str] = None
    coverage_type: Optional[str] = None
    requirement_match: Optional[bool] = True
    ai_quality_score: Optional[int] = None


class CoverageResult(BaseModel):
    coverage_complete: bool
    coverage_gaps: list[str] = Field(default_factory=list)
    duplicates: list[str] = Field(default_factory=list)
    invalid_tests: list[str] = Field(default_factory=list)
    additional_tests_required: list[AITestCase] = Field(default_factory=list)


class FailureAnalysis(BaseModel):
    observed_facts: list[str] = Field(default_factory=list)
    likely_cause: str
    confidence: str = "Low"
    suggested_next_step: Optional[str] = None
