import type {
  DriveDocumentReference,
  DeptId,
  DocTag,
  RoleId,
  UserType,
  VisibilityScope,
} from "@/core/operon";

export interface DriveAttachPayload {
  title: string;
  description: string;
  departmentId: DeptId;
  authorId: string;
  tag: DocTag;
  driveUrl: string;
  driveFileId: string;
  googleDocId: string;
  webViewLink: string;
  fileMimeType: string;
  ownerEmail: string;
  allowedRoleIds: RoleId[];
  allowedUserTypes: UserType[];
  allowedDepartments?: DeptId[];
  allowedTeamIds?: string[];
  visibilityScope?: VisibilityScope;
  folderId?: string;
  folderName?: string;
  linkedDocumentId?: string;
}

export interface DriveConnectResult {
  connected: boolean;
  message: string;
  authUrl?: string;
}

export interface DriveProvider {
  connectDrive(): Promise<DriveConnectResult>;
  listDocuments(): Promise<DriveDocumentReference[]>;
  syncDocuments(): Promise<void>;
  refreshMetadata(id: string): Promise<DriveDocumentReference>;
  getDocumentContent(id: string): Promise<string>;
  watchChanges(): Promise<void>;
  attachDocument(payload: DriveAttachPayload): Promise<DriveDocumentReference>;
  attachFolder(payload: DriveAttachPayload): Promise<DriveDocumentReference>;
  createFolderReference(payload: DriveAttachPayload): Promise<DriveDocumentReference>;
  searchDriveDocuments(query: string, departmentId?: DeptId | "all"): Promise<DriveDocumentReference[]>;
}