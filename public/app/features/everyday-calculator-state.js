(function installEverydayCalculatorStateFeature(global) {
  'use strict';

  const operators = new Set(['+', '-', '*', '/']);

  function clampPercent(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(1000, Math.max(0, numeric)) : fallback;
  }

  function normalizeState(input) {
    return {
      display: String(input?.display || '0').slice(0, 20),
      firstOperand: Number.isFinite(Number(input?.firstOperand)) ? Number(input.firstOperand) : null,
      operator: operators.has(input?.operator) ? input.operator : null,
      waitingForSecondOperand: !!input?.waitingForSecondOperand,
      lastOperator: operators.has(input?.lastOperator) ? input.lastOperator : null,
      lastOperand: Number.isFinite(Number(input?.lastOperand)) ? Number(input.lastOperand) : null,
      tipPercent: clampPercent(input?.tipPercent, 18),
      taxPercent: clampPercent(input?.taxPercent, 8),
      tipPanelOpen: input?.tipPanelOpen !== false,
    };
  }

  function applyOperation(firstOperand, secondOperand, operator) {
    if (!Number.isFinite(firstOperand) || !Number.isFinite(secondOperand)) return null;
    if (operator === '+') return firstOperand + secondOperand;
    if (operator === '-') return firstOperand - secondOperand;
    if (operator === '*') return firstOperand * secondOperand;
    if (operator === '/') return secondOperand === 0 ? null : firstOperand / secondOperand;
    return secondOperand;
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return 'Error';
    const absolute = Math.abs(value);
    if (absolute >= 1e12 || (absolute > 0 && absolute < 1e-6)) return value.toExponential(6).replace(/\.?0+e/, 'e');
    return String(Number(value.toFixed(8)));
  }

  function applyAction(input, type, payload = '') {
    const calc = normalizeState(input);
    let changed = false;

    if (type === 'digit') {
      const digit = String(payload || '').replace(/[^0-9]/g, '').slice(0, 1);
      if (!digit) return { state: calc, changed };
      if (calc.waitingForSecondOperand) {
        calc.display = digit;
        calc.waitingForSecondOperand = false;
      } else {
        calc.display = calc.display === '0' ? digit : (calc.display + digit).slice(0, 20);
      }
      changed = true;
    } else if (type === 'decimal') {
      if (calc.waitingForSecondOperand) {
        calc.display = '0.';
        calc.waitingForSecondOperand = false;
        changed = true;
      } else if (!calc.display.includes('.')) {
        calc.display += '.';
        changed = true;
      }
    } else if (type === 'clear') {
      calc.display = '0';
      calc.firstOperand = null;
      calc.operator = null;
      calc.waitingForSecondOperand = false;
      calc.lastOperator = null;
      calc.lastOperand = null;
      changed = true;
    } else if (type === 'backspace') {
      if (calc.waitingForSecondOperand) {
        calc.display = '0';
        calc.waitingForSecondOperand = false;
      } else {
        calc.display = calc.display.length <= 1 ? '0' : calc.display.slice(0, -1);
        if (calc.display === '-' || calc.display === '-0') calc.display = '0';
      }
      changed = true;
    } else if (type === 'operator') {
      const nextOperator = operators.has(payload) ? payload : null;
      if (!nextOperator) return { state: calc, changed };
      const inputValue = Number(calc.display);
      if (calc.operator && !calc.waitingForSecondOperand && Number.isFinite(inputValue)) {
        const nextValue = applyOperation(Number(calc.firstOperand), inputValue, calc.operator);
        if (nextValue == null) {
          calc.display = 'Error';
          calc.firstOperand = null;
          calc.operator = null;
          calc.waitingForSecondOperand = true;
        } else {
          calc.display = formatNumber(nextValue);
          calc.firstOperand = nextValue;
        }
      } else if (Number.isFinite(inputValue)) {
        calc.firstOperand = inputValue;
      }
      calc.operator = nextOperator;
      calc.waitingForSecondOperand = true;
      changed = true;
    } else if (type === 'equals') {
      const inputValue = Number(calc.display);
      if (calc.operator && Number.isFinite(calc.firstOperand) && Number.isFinite(inputValue)) {
        const operand = calc.waitingForSecondOperand ? Number(calc.lastOperand ?? inputValue) : inputValue;
        const nextValue = applyOperation(Number(calc.firstOperand), operand, calc.operator);
        if (nextValue == null) {
          calc.display = 'Error';
          calc.firstOperand = null;
        } else {
          calc.display = formatNumber(nextValue);
          calc.firstOperand = nextValue;
        }
        calc.lastOperator = calc.operator;
        calc.lastOperand = operand;
        calc.operator = null;
        calc.waitingForSecondOperand = true;
        changed = true;
      } else if (calc.lastOperator && Number.isFinite(inputValue) && Number.isFinite(calc.lastOperand)) {
        const nextValue = applyOperation(inputValue, Number(calc.lastOperand), calc.lastOperator);
        if (nextValue != null) {
          calc.display = formatNumber(nextValue);
          calc.firstOperand = nextValue;
          calc.waitingForSecondOperand = true;
          changed = true;
        }
      }
    } else if (type === 'toggle-tip-tax') {
      calc.tipPanelOpen = !calc.tipPanelOpen;
      changed = true;
    } else if (type === 'tip-percent') {
      const raw = String(payload ?? '').trim();
      if (!raw) return { state: calc, changed };
      const nextValue = Number(raw);
      if (Number.isFinite(nextValue)) {
        const bounded = clampPercent(nextValue, calc.tipPercent);
        if (bounded !== calc.tipPercent) {
          calc.tipPercent = bounded;
          changed = true;
        }
      }
    } else if (type === 'tax-percent') {
      const raw = String(payload ?? '').trim();
      if (!raw) return { state: calc, changed };
      const nextValue = Number(raw);
      if (Number.isFinite(nextValue)) {
        const bounded = clampPercent(nextValue, calc.taxPercent);
        if (bounded !== calc.taxPercent) {
          calc.taxPercent = bounded;
          changed = true;
        }
      }
    }
    return { state: calc, changed };
  }

  function calculateSummary(input, tipPercentRaw, taxPercentRaw) {
    const calc = normalizeState(input);
    const subtotal = Number(calc.display);
    const safeSubtotal = Number.isFinite(subtotal) ? subtotal : 0;
    const parsedTip = Number(String(tipPercentRaw ?? '').trim());
    const parsedTax = Number(String(taxPercentRaw ?? '').trim());
    const tipPercent = Number.isFinite(parsedTip) ? clampPercent(parsedTip, calc.tipPercent) : Number(calc.tipPercent || 0);
    const taxPercent = Number.isFinite(parsedTax) ? clampPercent(parsedTax, calc.taxPercent) : Number(calc.taxPercent || 0);
    const tipAmount = safeSubtotal * (tipPercent / 100);
    const taxAmount = safeSubtotal * (taxPercent / 100);
    return { subtotal: safeSubtotal, tipPercent, taxPercent, tipAmount, taxAmount, finalTotal: safeSubtotal + tipAmount + taxAmount };
  }

  const api = { normalizeState, applyOperation, formatNumber, applyAction, calculateSummary };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.everydayCalculatorState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
