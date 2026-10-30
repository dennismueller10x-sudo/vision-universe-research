// account-auto nur nutzen, wenn vorhanden und auf main beschraenkt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {verdict} from '../check-auto-env.mjs';

test('fehlt: ueberspringen, kein Fehler', () => assert.deepEqual(verdict(404), {ready: false, warning: verdict(404).warning}));
test('nur main: bereit', () => assert.deepEqual(verdict(200, {deployment_branch_policy: {custom_branch_policies: true}}, {branch_policies: [{name: 'main', type: 'branch'}]}), {ready: true}));
test('ohne Branch-Beschraenkung, mit weiteren Branches oder unlesbar: Fehler', () => {
  assert.ok(verdict(200, {deployment_branch_policy: null}).error);
  assert.ok(verdict(200, {deployment_branch_policy: {protected_branches: true, custom_branch_policies: false}}).error);
  assert.ok(verdict(200, {deployment_branch_policy: {custom_branch_policies: true}}, {branch_policies: [{name: 'main'}, {name: 'ops/*'}]}).error);
  assert.ok(verdict(200, {deployment_branch_policy: {custom_branch_policies: true}}, {branch_policies: [{name: 'main', type: 'tag'}]}).error);
  assert.ok(verdict(403).error);
});
