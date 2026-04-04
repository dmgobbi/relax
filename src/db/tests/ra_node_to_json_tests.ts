/*** Copyright 2016 Johannes Kessler 2016 Johannes Kessler
*
* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Relation } from 'db/exec/Relation';
import { raNodeToJSON } from 'db/exec/RANode';
import * as relalgjs from '../relalg';

QUnit.module('raNodeToJSON');

function exec_ra(query: string, relations: { [key: string]: Relation }) {
	return relalgjs.executeRelalg(query, relations);
}

function getTestRelations() {
	const R = relalgjs.executeRelalg(`{
		R.a:number, R.b:string, R.c:string

		1,   a,   d
		3,   c,   c
		4,   d,   f
		5,   d,   b
		6,   e,   f
	}`, {});

	const S = relalgjs.executeRelalg(`{
		S.b:string, S.d:number

		a,   100
		b,   300
		c,   400
		d,   200
		e,   150
	}`, {});

	return {
		R: new Relation('R', R),
		S: new Relation('S', S),
	};
}


QUnit.test('nullary node (relation)', function (assert) {
	const relations = getTestRelations();
	const root = exec_ra('R', relations);
	root.getResult();
	const json: any = raNodeToJSON(root);

	assert.equal(json.operationType, 'relation');
	assert.equal(json.name, 'R');
	assert.equal(json.resultNumRows, 5);
	assert.equal(json.schema.columns.length, 3);
	assert.equal(json.schema.columns[0].name, 'a');
	assert.equal(json.schema.columns[0].relAlias, 'R');
	assert.equal(json.schema.columns[0].type, 'number');
	assert.ok(!json.child);
	assert.ok(!json.left);
	assert.ok(!json.right);
	assert.ok(!json.operationSymbol);
});


QUnit.test('unary node (selection)', function (assert) {
	const relations = getTestRelations();
	const root = exec_ra('sigma R.a > 3 (R)', relations);
	root.getResult();
	const json: any = raNodeToJSON(root);

	assert.equal(json.operationType, 'selection');
	assert.equal(json.operationSymbol, 'σ');
	assert.ok(json.arguments.length > 0);
	assert.equal(json.resultNumRows, 3);
	assert.ok(json.child);
	assert.equal(json.child.operationType, 'relation');
	assert.equal(json.child.name, 'R');
	assert.ok(!json.left);
});


QUnit.test('binary node (cross join)', function (assert) {
	const relations = getTestRelations();
	const root = exec_ra('R x S', relations);
	root.getResult();
	const json: any = raNodeToJSON(root);

	assert.equal(json.operationType, 'crossJoin');
	assert.equal(json.operationSymbol, '⨯');
	assert.equal(json.resultNumRows, 25);
	assert.ok(json.left);
	assert.ok(json.right);
	assert.equal(json.left.operationType, 'relation');
	assert.equal(json.left.name, 'R');
	assert.equal(json.right.operationType, 'relation');
	assert.equal(json.right.name, 'S');
	assert.ok(!json.child);
});


QUnit.test('deeper tree (projection on selection on cross join)', function (assert) {
	const relations = getTestRelations();
	const root = exec_ra('pi R.a, S.d (sigma R.b = S.b (R x S))', relations);
	root.getResult();
	const json: any = raNodeToJSON(root);

	assert.equal(json.operationType, 'projection');
	assert.equal(json.operationSymbol, 'π');
	assert.equal(json.schema.columns.length, 2);

	const sel = json.child;
	assert.ok(sel);
	assert.equal(sel.operationType, 'selection');
	assert.equal(sel.operationSymbol, 'σ');

	const join = sel.child;
	assert.ok(join);
	assert.equal(join.operationType, 'crossJoin');

	assert.equal(join.left.operationType, 'relation');
	assert.equal(join.left.name, 'R');
	assert.equal(join.right.operationType, 'relation');
	assert.equal(join.right.name, 'S');
});


QUnit.test('HTML entities decoded correctly', function (assert) {
	const relations = getTestRelations();

	const selRoot = exec_ra('sigma R.a > 1 (R)', relations);
	selRoot.getResult();
	assert.equal((raNodeToJSON(selRoot) as any).operationSymbol, 'σ');

	const piRoot = exec_ra('pi R.a (R)', relations);
	piRoot.getResult();
	assert.equal((raNodeToJSON(piRoot) as any).operationSymbol, 'π');

	const rhoRoot = exec_ra('rho X (R)', relations);
	rhoRoot.getResult();
	assert.equal((raNodeToJSON(rhoRoot) as any).operationSymbol, 'ρ');

	const tauRoot = exec_ra('tau R.a asc (R)', relations);
	tauRoot.getResult();
	assert.equal((raNodeToJSON(tauRoot) as any).operationSymbol, 'τ');

	const crossRoot = exec_ra('R x S', relations);
	crossRoot.getResult();
	assert.equal((raNodeToJSON(crossRoot) as any).operationSymbol, '⨯');
});


QUnit.test('HTML tags stripped from arguments', function (assert) {
	const relations = getTestRelations();

	const root = exec_ra('sigma R.a > 3 (R)', relations);
	root.getResult();
	const json: any = raNodeToJSON(root);

	assert.ok(json.arguments.indexOf('<') === -1, 'no HTML tags in selection arguments');
	assert.ok(json.arguments.indexOf('3') >= 0);

	const piRoot = exec_ra('pi R.a, R.b (R)', relations);
	piRoot.getResult();
	const piJson: any = raNodeToJSON(piRoot);
	assert.ok(piJson.arguments.indexOf('<') === -1, 'no HTML tags in projection arguments');
	assert.ok(piJson.arguments.indexOf('R.a') >= 0);
});
