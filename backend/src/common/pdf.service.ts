import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { env } from '../config/env';

/** Renders HTML to PDF through the self-hosted Gotenberg container. */
@Injectable()
export class PdfService {
  private logger = new Logger('Pdf');
  async htmlToPdf(html: string): Promise<Buffer> {
    const form = new FormData();
    form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
    form.append('paperWidth', '8.27'); form.append('paperHeight', '11.69');
    form.append('marginTop', '0.5'); form.append('marginBottom', '0.5'); form.append('marginLeft', '0.5'); form.append('marginRight', '0.5');
    form.append('printBackground', 'true');
    try {
      const res = await fetch(`${env.gotenbergUrl}/forms/chromium/convert/html`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Gotenberg ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      this.logger.error(`PDF generation failed: ${(e as Error).message}`);
      throw new InternalServerErrorException('PDF service unavailable');
    }
  }
}
