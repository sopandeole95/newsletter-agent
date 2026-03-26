import { getDriveClient } from "./google";
import { Readable } from "stream";

export async function uploadToDrive(
  fileName: string,
  pdfBuffer: Buffer,
  folderName: string
): Promise<string> {
  const drive = getDriveClient();

  // Find or create the dated folder
  const folderId = await findOrCreateFolder(drive, folderName);

  // Upload the PDF
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: "application/pdf",
      parents: [folderId],
    },
    media: {
      mimeType: "application/pdf",
      body: Readable.from(pdfBuffer),
    },
    fields: "id,webViewLink",
  });

  return res.data.webViewLink || res.data.id || "";
}

async function findOrCreateFolder(
  drive: ReturnType<typeof getDriveClient>,
  folderName: string
): Promise<string> {
  // Check if folder already exists
  const search = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
  });

  if (search.data.files && search.data.files.length > 0) {
    return search.data.files[0].id!;
  }

  // Create the folder
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  return folder.data.id!;
}
