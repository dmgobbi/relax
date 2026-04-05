/*** Copyright 2016 Johannes Kessler 2016 Johannes Kessler
*
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as i18n from 'i18next';
import { CodeInfo } from './CodeInfo';
import { ExecutionError } from './ExecutionError';

type ExecutionSafetyGlobal = typeof globalThis & {
	__RELAX_EXECUTION_MAX_INTERMEDIATE_ROWS__?: number,
	__RELAX_EXECUTION_MAX_JOIN_COMPARISONS__?: number,
};

export interface ExecutionSafetyState {
	maxIntermediateRows: number,
	maxJoinComparisons: number,
	consumedJoinComparisons: number,
}

export const DEFAULT_MAX_INTERMEDIATE_ROWS = 200000;
export const DEFAULT_MAX_JOIN_COMPARISONS = DEFAULT_MAX_INTERMEDIATE_ROWS * 10;

function getConfiguredMaxIntermediateRows() {
	const override = (globalThis as ExecutionSafetyGlobal).__RELAX_EXECUTION_MAX_INTERMEDIATE_ROWS__;
	if (typeof override === 'number' && isFinite(override) && override > 0) {
		return Math.floor(override);
	}

	return DEFAULT_MAX_INTERMEDIATE_ROWS;
}

function getConfiguredMaxJoinComparisons() {
	const override = (globalThis as ExecutionSafetyGlobal).__RELAX_EXECUTION_MAX_JOIN_COMPARISONS__;
	if (typeof override === 'number' && isFinite(override) && override > 0) {
		return Math.floor(override);
	}

	return DEFAULT_MAX_JOIN_COMPARISONS;
}

export function createExecutionSafetyState(): ExecutionSafetyState {
	return {
		maxIntermediateRows: getConfiguredMaxIntermediateRows(),
		maxJoinComparisons: getConfiguredMaxJoinComparisons(),
		consumedJoinComparisons: 0,
	};
}

export function ensureIntermediateResultRows(
	state: ExecutionSafetyState,
	nextNumRows: number,
	context: string,
	codeInfo?: CodeInfo | null,
) {
	if (nextNumRows <= state.maxIntermediateRows) {
		return;
	}

	throw new ExecutionError(i18n.t('db.messages.exec.error-intermediate-result-too-large', {
		defaultValue: 'aborted {{context}} because an intermediate result would exceed the safety limit of {{limit}} rows ({{rows}} rows). Adjust __RELAX_EXECUTION_MAX_INTERMEDIATE_ROWS__ to change this cap.',
		context,
		limit: state.maxIntermediateRows,
		rows: nextNumRows,
	}), codeInfo);
}

export function consumeJoinComparisons(
	state: ExecutionSafetyState,
	additionalComparisons: number,
	context: string,
	codeInfo?: CodeInfo | null,
) {
	if (additionalComparisons <= 0) {
		return;
	}

	const nextNumComparisons = state.consumedJoinComparisons + additionalComparisons;
	if (nextNumComparisons <= state.maxJoinComparisons) {
		state.consumedJoinComparisons = nextNumComparisons;
		return;
	}

	throw new ExecutionError(i18n.t('db.messages.exec.error-join-comparison-limit-exceeded', {
		defaultValue: 'aborted {{context}} because join evaluation would exceed the safety limit of {{limit}} row comparisons ({{rows}} comparisons). Adjust __RELAX_EXECUTION_MAX_JOIN_COMPARISONS__ to change this cap.',
		context,
		limit: state.maxJoinComparisons,
		rows: nextNumComparisons,
	}), codeInfo);
}
