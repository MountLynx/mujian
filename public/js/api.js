/* 唯一的 fetch 出口：JSON 进出，错误带状态码与校验 issues。 */

export async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = new Error(body?.error || `请求失败（${response.status}）`);
    error.status = response.status;
    error.issues = body?.issues || [];
    error.runId = body?.runId;
    error.data = body;
    throw error;
  }
  return body;
}
