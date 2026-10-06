# Phase 35 — Canonical SetupState Contract

## Scope

This slice defines the product lifecycle vocabulary and immutable observation envelope.
It reuses the existing Rule Contract by reference and does not add an evaluator, data
pipeline, endpoint or score.

## Current production truth

The existing Technical materialization contains one current real bundle per connected
title. Scenario labels and Trade Setup completeness are evidence, not Product SetupState
values. Without an ordered series of at least two real, identity- and methodology-consistent
snapshots, the contract returns `SETUP_STATE_HISTORY_NOT_MATERIALIZED`, a null lifecycle,
and `NOT_CERTIFIED` for backtesting.

The methodology remains `SPECIFIED_NOT_ACTIVE`. Activation requires an approved mapping,
ordered snapshot history, verifiable Rule Contract references and a validated identity /
methodology chain. Elliott remains evidence only.

## Boundary

No Signals, Radar, Watchlist, Scanner or Backtest consumer is activated in this slice.
No file under either Discovery product surface is changed.
