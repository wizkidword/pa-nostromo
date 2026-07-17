import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { applyAction, calculateSummary, normalizeState } = require('../public/app/features/everyday-calculator-state.js');

assert.deepEqual(normalizeState({ display: '12', operator: '+', tipPercent: 1200, taxPercent: -1 }), {
  display: '12',
  firstOperand: null,
  operator: '+',
  waitingForSecondOperand: false,
  lastOperator: null,
  lastOperand: null,
  tipPercent: 1000,
  taxPercent: 0,
  tipPanelOpen: true,
});

let calc = normalizeState();
for (const [type, payload] of [['digit', '1'], ['digit', '2'], ['operator', '+'], ['digit', '3'], ['equals', '']]) {
  calc = applyAction(calc, type, payload).state;
}
assert.equal(calc.display, '15');
calc = applyAction(calc, 'equals').state;
assert.equal(calc.display, '18');
calc = applyAction(calc, 'operator', '/').state;
calc = applyAction(calc, 'digit', '0').state;
calc = applyAction(calc, 'equals').state;
assert.equal(calc.display, 'Error');

const summary = calculateSummary({ display: '100', tipPercent: 18, taxPercent: 8 }, 18, 8);
assert.deepEqual(summary, { subtotal: 100, tipPercent: 18, taxPercent: 8, tipAmount: 18, taxAmount: 8, finalTotal: 126 });

console.log('everyday-calculator-state-feature: PASS');
