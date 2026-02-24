export interface GuardrailsRuleInput {
  allowList?: string[];
  denyList?: string[];
}

export interface GuardrailsInput {
  inputValidationRules: GuardrailsRuleInput;
}
