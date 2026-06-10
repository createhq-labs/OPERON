# Google Drive Folder Structure Guide

Complete architecture for organizing documents in Google Drive by role.

## Folder Hierarchy

```
Operon/
├── Co-Founder/
│   ├── Financial Reports/
│   ├── Board Materials/
│   ├── Strategic Plans/
│   └── Executive Summaries/
├── HR/
│   ├── Policies/
│   ├── Employee Handbook/
│   ├── Benefits/
│   └── Hiring/
├── Finance/
│   ├── Accounting/
│   ├── Budgets/
│   ├── Reports/
│   └── Expenses/
├── Team Lead/
│   ├── SOPs/
│   ├── Team Processes/
│   ├── Documentation/
│   └── Guidelines/
├── Content Creator/
│   ├── Brand Assets/
│   ├── Marketing Materials/
│   ├── Campaign Assets/
│   └── Design Guidelines/
├── Employee Resources/
│   ├── Knowledge Base/
│   ├── How-To Guides/
│   ├── Resources/
│   └── FAQ/
├── Intern Training/
│   ├── Onboarding/
│   ├── Training Materials/
│   ├── Checklists/
│   └── First Week/
└── Shared/
    ├── Company Wide/
    ├── All Hands/
    ├── Templates/
    └── Archives/
```

## Automatic Folder Assignment

When a user uploads a document based on their role:

| User Role | Root Folder | Auto-Path |
|-----------|------------|-----------|
| Co-Founder | Operon/Co-Founder | Determined by document type |
| HR Manager | Operon/HR | Determined by document type |
| Finance Manager | Operon/Finance | Determined by document type |
| Team Lead | Operon/Team Lead | Determined by document type |
| Content Creator | Operon/Content Creator | Determined by document type |
| Employee | Operon/Employee Resources | Determined by document type |
| Intern | Operon/Intern Training | Determined by document type |

## Folder Structure Rules

### 1. Naming Convention

- **Use clear, descriptive names**
  - ✅ "Q4 Financial Report 2024"
  - ❌ "Report Q4"

- **Use consistent date format**
  - Format: YYYY-MM-DD for chronological sorting
  - Example: "2024-06-15 Board Meeting Notes"

- **Use hyphens to separate words**
  - ✅ "Employee-Handbook-2024"
  - ❌ "Employee Handbook 2024"

### 2. Archive Strategy

Old documents automatically move to role-specific archives:

```
Operon/
└── {Role}/
    ├── [Active Documents]
    └── Archive/
        ├── 2024/
        ├── 2023/
        └── 2022/
```

### 3. Shared Folder Usage

Use `Operon/Shared` for:
- Company-wide documents
- All-hands materials
- Universal templates
- Cross-functional resources

## Metadata & File Organization

### Automatic Properties

Every file uploaded to Drive gets:

```json
{
  "appProperties": {
    "operon": "true",
    "uploadedBy": "user-id",
    "roleId": "finance",
    "uploadedAt": "2024-06-15T10:30:00Z",
    "documentId": "doc-uuid"
  }
}
```

### File Naming in Operon

Files in Operon appear as:
- Title: Custom title entered by user
- Subtitle: Original filename
- Size and date from Drive metadata

## Role-Specific Folder Maps

### Co-Founder
```
Co-Founder/
├── Financial Reports/
├── Board Materials/
├── Strategic Plans/
├── Executive Summaries/
└── Archive/
```

**Access**: Full platform access
**Permissions**: Can view all documents

### HR
```
HR/
├── Policies/
├── Employee Handbook/
├── Benefits/
├── Hiring/
└── Archive/
```

**Access**: People and policy management
**Permissions**: Can manage HR documents, view employee records

### Finance
```
Finance/
├── Accounting/
├── Budgets/
├── Reports/
├── Expenses/
└── Archive/
```

**Access**: Financial documents and reporting
**Permissions**: Can manage finance documents, view expense reports

### Team Lead
```
Team Lead/
├── SOPs/
├── Team Processes/
├── Documentation/
├── Guidelines/
└── Archive/
```

**Access**: Team documentation and SOPs
**Permissions**: Can manage team documents, create procedures

### Content Creator
```
Content Creator/
├── Brand Assets/
├── Marketing Materials/
├── Campaign Assets/
├── Design Guidelines/
└── Archive/
```

**Access**: Marketing assets and content
**Permissions**: Can manage marketing documents

### Employee Resources
```
Employee Resources/
├── Knowledge Base/
├── How-To Guides/
├── Resources/
├── FAQ/
└── Archive/
```

**Access**: Knowledge and resources
**Permissions**: Read-only access (except own documents)

### Intern Training
```
Intern Training/
├── Onboarding/
├── Training Materials/
├── Checklists/
├── First Week/
└── Archive/
```

**Access**: Training and onboarding
**Permissions**: Access to training materials, limited editing

### Shared Resources
```
Shared/
├── Company Wide/
├── All Hands/
├── Templates/
└── Archives/
```

**Access**: All users
**Permissions**: All users can read

## File Organization Best Practices

### By Type

Organize documents by category:
```
Finance/
├── Accounting/
│   ├── Invoices/
│   ├── Receipts/
│   └── Reconciliation/
├── Budgets/
│   ├── 2024 Budget/
│   ├── 2025 Budget/
│   └── Forecasts/
└── Reports/
```

### By Time

Organize chronologically:
```
HR/
├── 2024/
│   ├── Q1/
│   ├── Q2/
│   ├── Q3/
│   └── Q4/
└── 2023/
```

### By Project

Organize by initiative:
```
Content Creator/
├── Campaign Q3 Launch/
│   ├── Assets/
│   ├── Copy/
│   └── Analytics/
└── Product Launch/
```

## Access Control by Folder

### Public (All Users)
```
Operon/Shared/
```

### Role-Specific
```
Operon/{Role}/
```

### Personal
Files uploaded by user to their role folder:
```
Operon/{Role}/[User can access own]
```

## Automatic Archival

Documents automatically archive after 1 year:

1. **Detection**: Run weekly job checking modification dates
2. **Move**: Move to Archive/{Year} folder
3. **Notification**: User notified of archival
4. **Access**: Archived files remain accessible
5. **Retention**: Keep for 7 years per compliance

```typescript
async function archiveOldFiles() {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Find files older than 1 year
  const oldFiles = await queryFilesModifiedBefore(oneYearAgo);

  for (const file of oldFiles) {
    // Get archive folder
    const archiveFolder = await getOrCreateArchiveFolder(file.roleId, new Date().getFullYear());
    
    // Move file
    await driveService.moveFile(file.id, archiveFolder.id, accessToken);
  }
}

// Run weekly
schedule("0 2 * * 0", archiveOldFiles);
```

## Folder Templates

Create templates for common document types:

### Meeting Minutes Template
```
Meeting Minutes - [Date]
├── Attendees
├── Agenda
├── Decisions
├── Action Items
└── Next Steps
```

### Project Documentation Template
```
Project - [Name]
├── Overview
├── Timeline
├── Requirements
├── Resources
├── Status Updates
└── Deliverables
```

### Process Documentation Template
```
Process - [Name]
├── Overview
├── Steps
├── Roles
├── Tools
├── Troubleshooting
└── Contact
```

## Folder Sharing Rules

### Internal Sharing
- Role folders shared with users in that role
- Shared folder accessible to all users
- Archive folders read-only

### External Sharing
- Not allowed directly in Drive
- Use Operon's permission system
- Link to external parties via Operon

## Maintenance

### Monthly Folder Audit

```bash
# Check folder structure integrity
npm run audit:drive-folders

# Fix permissions
npm run fix:drive-permissions

# Cleanup orphaned files
npm run cleanup:orphaned-files
```

### Annual Cleanup

- Archive 1+ year old files
- Delete temporary files
- Organize by-project folders
- Update naming consistency

## Troubleshooting

### "File not in correct folder"

1. Check user's role
2. Verify upload destination
3. Check folder mapping in Supabase
4. Manually move file and sync metadata

### "Permission denied on folder"

1. Check user's Drive access token
2. Verify folder ownership
3. Check role-folder mapping
4. Re-authenticate user

### "Folder structure inconsistent"

Run repair:

```bash
npm run repair:drive-structure --roleId finance
```

## Migration Guide

If migrating existing documents:

1. **Audit existing files**
   - List all Drive files
   - Categorize by role
   - Identify orphaned files

2. **Create folder structure**
   - Run folder initialization
   - Verify all folders created
   - Set permissions

3. **Move files**
   - Move by role
   - Update Supabase metadata
   - Verify all files moved
   - Index for search

4. **Verify**
   - Check folder structure
   - Test access by role
   - Verify search indexes
   - Test real-time sync

```bash
npm run migrate:files --batch-size 50 --dry-run
npm run migrate:files --batch-size 50
npm run verify:migration
```

## Reference

- [Google Drive Organization Tips](https://support.google.com/drive/answer/2375105)
- [Best Practices for Shared Drives](https://support.google.com/a/answer/7336550)
- [Team Drive vs Shared Drive](https://support.google.com/drive/answer/9310351)
