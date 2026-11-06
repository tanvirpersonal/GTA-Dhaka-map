import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOSM } from '../../src/data/OSMClient';

const bounds = { west: 90.4, south: 23.76, east: 90.402, north: 23.762 };
const endpoints = ['https://overpass.example.test/api'];

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchOSM cancellation and retry handling', () => {
  it('does not start a request when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOSM(bounds, { signal: controller.signal, endpoints })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('removes the abort listener when a retry delay completes', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, headers: new Headers() })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ elements: [] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const request = fetchOSM(bounds, {
      signal: controller.signal,
      endpoints,
      maxAttempts: 2,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(request).resolves.toEqual({ elements: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('rejects invalid retry configuration before making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOSM(bounds, { maxAttempts: 0, endpoints })).rejects.toThrow(
      'maxAttempts must be a positive integer.',
    );
    await expect(fetchOSM(bounds, { endpoints: [] })).rejects.toThrow(
      'At least one Overpass endpoint is required.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
