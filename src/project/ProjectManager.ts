import { downloadBlob } from '../export/GLBExporter';
import { parseProject } from './ProjectSerializer';
import type { ProjectFile } from '../types/project';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Download a serialized project as a .dwb.json file. */
export function saveProjectFile(json: string, name = 'dhaka-project'): void {
  const bytes = new TextEncoder().encode(json);
  downloadBlob(bytes.buffer as ArrayBuffer, `${name}.dwb.json`, 'application/json');
}

/** Read and validate a project file chosen by the user. */
export async function openProjectFile(file: File): Promise<ProjectFile> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Project file is too large (50 MB max).');
  return parseProject(await file.text());
}
