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

    machine.dispatch({ type: 'SEND_CODE' });
    machine.dispatch({ type: 'CODE_SENT' });
    machine.dispatch({ type: 'VERIFY_CODE' });
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

  it('should correctly guard all state x action transitions (table-driven)', () => {
    const testError = new Error('test-error');
    const testToken = 'token-123';

    type TestCase = {
      from: AuthState['status'];
      action: AuthAction<string, Error>;
      expectedStatus: AuthState['status'];
      description: string;
    };

    const transitions: TestCase[] = [
      // From 'idle'
      { from: 'idle', action: { type: 'SEND_CODE' }, expectedStatus: 'sending', description: 'idle + SEND_CODE -> sending' },
      { from: 'idle', action: { type: 'CODE_SENT' }, expectedStatus: 'idle', description: 'idle + CODE_SENT -> idle (ignored)' },
      { from: 'idle', action: { type: 'VERIFY_CODE' }, expectedStatus: 'idle', description: 'idle + VERIFY_CODE -> idle (ignored)' },
      { from: 'idle', action: { type: 'VERIFY_SUCCESS', payload: testToken }, expectedStatus: 'success', description: 'idle + VERIFY_SUCCESS -> success' },
      { from: 'idle', action: { type: 'VERIFY_FAILURE', payload: testError }, expectedStatus: 'idle', description: 'idle + VERIFY_FAILURE -> idle (ignored)' },
      { from: 'idle', action: { type: 'SET_ERROR', payload: testError }, expectedStatus: 'error', description: 'idle + SET_ERROR -> error' },
      { from: 'idle', action: { type: 'CLEAR_ERROR' }, expectedStatus: 'idle', description: 'idle + CLEAR_ERROR -> idle (ignored)' },
      { from: 'idle', action: { type: 'RESET' }, expectedStatus: 'idle', description: 'idle + RESET -> idle' },

      // From 'sending'
      { from: 'sending', action: { type: 'SEND_CODE' }, expectedStatus: 'sending', description: 'sending + SEND_CODE -> sending (ignored)' },
      { from: 'sending', action: { type: 'CODE_SENT' }, expectedStatus: 'pending', description: 'sending + CODE_SENT -> pending' },
      { from: 'sending', action: { type: 'VERIFY_CODE' }, expectedStatus: 'sending', description: 'sending + VERIFY_CODE -> sending (ignored)' },
      { from: 'sending', action: { type: 'VERIFY_SUCCESS', payload: testToken }, expectedStatus: 'sending', description: 'sending + VERIFY_SUCCESS -> sending (ignored)' },
      { from: 'sending', action: { type: 'VERIFY_FAILURE', payload: testError }, expectedStatus: 'sending', description: 'sending + VERIFY_FAILURE -> sending (ignored)' },
      { from: 'sending', action: { type: 'SET_ERROR', payload: testError }, expectedStatus: 'error', description: 'sending + SET_ERROR -> error' },
      { from: 'sending', action: { type: 'CLEAR_ERROR' }, expectedStatus: 'sending', description: 'sending + CLEAR_ERROR -> sending (ignored)' },
      { from: 'sending', action: { type: 'RESET' }, expectedStatus: 'idle', description: 'sending + RESET -> idle' },

      // From 'pending'
      { from: 'pending', action: { type: 'SEND_CODE' }, expectedStatus: 'sending', description: 'pending + SEND_CODE -> sending' },
      { from: 'pending', action: { type: 'CODE_SENT' }, expectedStatus: 'pending', description: 'pending + CODE_SENT -> pending (ignored)' },
      { from: 'pending', action: { type: 'VERIFY_CODE' }, expectedStatus: 'verifying', description: 'pending + VERIFY_CODE -> verifying' },
      { from: 'pending', action: { type: 'VERIFY_SUCCESS', payload: testToken }, expectedStatus: 'success', description: 'pending + VERIFY_SUCCESS -> success' },
      { from: 'pending', action: { type: 'VERIFY_FAILURE', payload: testError }, expectedStatus: 'pending', description: 'pending + VERIFY_FAILURE -> pending (ignored)' },
      { from: 'pending', action: { type: 'SET_ERROR', payload: testError }, expectedStatus: 'error', description: 'pending + SET_ERROR -> error' },
      { from: 'pending', action: { type: 'CLEAR_ERROR' }, expectedStatus: 'pending', description: 'pending + CLEAR_ERROR -> pending' },
      { from: 'pending', action: { type: 'RESET' }, expectedStatus: 'idle', description: 'pending + RESET -> idle' },

      // From 'verifying'
      { from: 'verifying', action: { type: 'SEND_CODE' }, expectedStatus: 'verifying', description: 'verifying + SEND_CODE -> verifying (ignored)' },
      { from: 'verifying', action: { type: 'CODE_SENT' }, expectedStatus: 'verifying', description: 'verifying + CODE_SENT -> verifying (ignored)' },
      { from: 'verifying', action: { type: 'VERIFY_CODE' }, expectedStatus: 'verifying', description: 'verifying + VERIFY_CODE -> verifying (ignored)' },
      { from: 'verifying', action: { type: 'VERIFY_SUCCESS', payload: testToken }, expectedStatus: 'success', description: 'verifying + VERIFY_SUCCESS -> success' },
      { from: 'verifying', action: { type: 'VERIFY_FAILURE', payload: testError }, expectedStatus: 'pending', description: 'verifying + VERIFY_FAILURE -> pending' },
      { from: 'verifying', action: { type: 'SET_ERROR', payload: testError }, expectedStatus: 'error', description: 'verifying + SET_ERROR -> error' },
      { from: 'verifying', action: { type: 'CLEAR_ERROR' }, expectedStatus: 'verifying', description: 'verifying + CLEAR_ERROR -> verifying (ignored)' },
      { from: 'verifying', action: { type: 'RESET' }, expectedStatus: 'idle', description: 'verifying + RESET -> idle' },

      // From 'success'
      { from: 'success', action: { type: 'SEND_CODE' }, expectedStatus: 'success', description: 'success + SEND_CODE -> success (ignored)' },
      { from: 'success', action: { type: 'CODE_SENT' }, expectedStatus: 'success', description: 'success + CODE_SENT -> success (ignored)' },
      { from: 'success', action: { type: 'VERIFY_CODE' }, expectedStatus: 'success', description: 'success + VERIFY_CODE -> success (ignored)' },
      { from: 'success', action: { type: 'VERIFY_SUCCESS', payload: testToken }, expectedStatus: 'success', description: 'success + VERIFY_SUCCESS -> success (ignored)' },
      { from: 'success', action: { type: 'VERIFY_FAILURE', payload: testError }, expectedStatus: 'success', description: 'success + VERIFY_FAILURE -> success (ignored)' },
      { from: 'success', action: { type: 'SET_ERROR', payload: testError }, expectedStatus: 'success', description: 'success + SET_ERROR -> success (ignored)' },
      { from: 'success', action: { type: 'CLEAR_ERROR' }, expectedStatus: 'success', description: 'success + CLEAR_ERROR -> success (ignored)' },
      { from: 'success', action: { type: 'RESET' }, expectedStatus: 'idle', description: 'success + RESET -> idle' },

      // From 'error'
      { from: 'error', action: { type: 'SEND_CODE' }, expectedStatus: 'sending', description: 'error + SEND_CODE -> sending' },
      { from: 'error', action: { type: 'CODE_SENT' }, expectedStatus: 'error', description: 'error + CODE_SENT -> error (ignored)' },
      { from: 'error', action: { type: 'VERIFY_CODE' }, expectedStatus: 'error', description: 'error + VERIFY_CODE -> error (ignored)' },
      { from: 'error', action: { type: 'VERIFY_SUCCESS', payload: testToken }, expectedStatus: 'success', description: 'error + VERIFY_SUCCESS -> success' },
      { from: 'error', action: { type: 'VERIFY_FAILURE', payload: testError }, expectedStatus: 'error', description: 'error + VERIFY_FAILURE -> error (ignored)' },
      { from: 'error', action: { type: 'SET_ERROR', payload: testError }, expectedStatus: 'error', description: 'error + SET_ERROR -> error' },
      { from: 'error', action: { type: 'CLEAR_ERROR' }, expectedStatus: 'error', description: 'error + CLEAR_ERROR -> error (ignored)' },
      { from: 'error', action: { type: 'RESET' }, expectedStatus: 'idle', description: 'error + RESET -> idle' },
    ];

    for (const { from, action, expectedStatus, description } of transitions) {
      const state: AuthState<string, Error> = {
        status: from,
        data: from === 'success' ? 'initial-token' : null,
        error: from === 'error' || from === 'pending' ? testError : null,
        attempts: 1,
        lastUpdated: 500,
      };

      const result = authReducer(state, action);
      expect(result.status, `Failed transition: ${description}`).toBe(expectedStatus);
    }
  });
});
