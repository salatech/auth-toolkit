import { describe, expect, it, vi } from 'vitest';
import { AuthStateMachine, authReducer } from '../core/state-machine';
import { AuthState } from '../core/types';

describe('Auth Core State Machine', () => {
  it('should initialize with idle status', () => {
    const machine = new AuthStateMachine();
    const state = machine.getState();

    expect(state.status).toBe('idle');
    expect(state.data).toBeNull();
    expect(state.error).toBeNull();
    expect(state.attempts).toBe(0);
  });

  it('should transition through standard OTP auth flow correctly', () => {
    const machine = new AuthStateMachine<string, Error>();

    machine.dispatch({ type: 'SEND_CODE' });
    expect(machine.getState().status).toBe('sending');

    machine.dispatch({ type: 'CODE_SENT' });
    expect(machine.getState().status).toBe('pending');

    machine.dispatch({ type: 'VERIFY_CODE' });
    expect(machine.getState().status).toBe('verifying');
    expect(machine.getState().attempts).toBe(1);

    machine.dispatch({ type: 'VERIFY_SUCCESS', payload: 'auth-token-123' });
    const successState = machine.getState();
    expect(successState.status).toBe('success');
    expect(successState.data).toBe('auth-token-123');
    expect(successState.error).toBeNull();
  });

  it('should return to pending on verify failure so the user can retry', () => {
    const machine = new AuthStateMachine<string, Error>();

    machine.dispatch({ type: 'SEND_CODE' });
    machine.dispatch({ type: 'CODE_SENT' });
    machine.dispatch({ type: 'VERIFY_CODE' });

    const err = new Error('Invalid code entered');
    machine.dispatch({ type: 'VERIFY_FAILURE', payload: err });

    const retryState = machine.getState();
    expect(retryState.status).toBe('pending');
    expect(retryState.error).toBe(err);
    expect(retryState.attempts).toBe(1);
  });

  it('should clear retryable errors while pending', () => {
    const machine = new AuthStateMachine<string, Error>();
    const err = new Error('Wrong code');

    machine.dispatch({ type: 'CODE_SENT' });
    machine.dispatch({ type: 'VERIFY_FAILURE', payload: err });
    machine.dispatch({ type: 'CLEAR_ERROR' });

    const cleared = machine.getState();
    expect(cleared.status).toBe('pending');
    expect(cleared.error).toBeNull();
  });

  it('should ignore CLEAR_ERROR outside pending', () => {
    const machine = new AuthStateMachine<string, Error>();
    const err = new Error('Fatal');

    machine.dispatch({ type: 'SET_ERROR', payload: err });
    machine.dispatch({ type: 'CLEAR_ERROR' });

    expect(machine.getState().status).toBe('error');
    expect(machine.getState().error).toBe(err);
  });

  it('should transition to terminal error on SET_ERROR', () => {
    const machine = new AuthStateMachine<string, Error>();
    const err = new Error('Network down');

    machine.dispatch({ type: 'SET_ERROR', payload: err });

    expect(machine.getState().status).toBe('error');
    expect(machine.getState().error).toBe(err);
  });

  it('should reset state on RESET action', () => {
    const machine = new AuthStateMachine<string, Error>();

    machine.dispatch({ type: 'SEND_CODE' });
    machine.dispatch({ type: 'VERIFY_SUCCESS', payload: 'token' });
    machine.dispatch({ type: 'RESET' });

    const resetState = machine.getState();
    expect(resetState.status).toBe('idle');
    expect(resetState.data).toBeNull();
    expect(resetState.error).toBeNull();
    expect(resetState.attempts).toBe(0);
  });

  it('should notify subscribers when state updates', () => {
    const machine = new AuthStateMachine();
    const listener = vi.fn();

    machine.subscribe(listener);
    machine.dispatch({ type: 'SEND_CODE' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sending' })
    );
  });

  it('should unsubscribe listeners', () => {
    const machine = new AuthStateMachine();
    const listener = vi.fn();

    const unsubscribe = machine.subscribe(listener);
    unsubscribe();
    machine.dispatch({ type: 'SEND_CODE' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('should handle pure reducer function deterministically', () => {
    const initial: AuthState<string, Error> = {
      status: 'idle',
      data: null,
      error: null,
      attempts: 0,
      lastUpdated: 1000,
    };

    const next = authReducer(initial, { type: 'SEND_CODE' });
    expect(next.status).toBe('sending');
    expect(next.error).toBeNull();
  });
});
