# ADR 0008: public academic data and private applicant reports

Status: accepted by the product owner during design on 2026-10-01; implemented in the Academic Discovery workflow.

Academic Discovery shares only licensed public source metadata and discovery candidates. Applicant profiles, personalized rankings and report history remain in the requesting conversation or its exported file, because a shared catalog should not become a repository of applicant facts. Public evidence identifiers and observation dates can explain changes between reports without storing the private input or output on the server. Source-specific retention and verification rules still apply; this decision does not broaden the caches authorized by ADRs 0006 and 0007.
