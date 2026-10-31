import { redirect } from 'next/navigation';

/** Notifications deep-link to /enquiries/<id>; the enquiry detail is a drawer on the list page, so forward there. */
export default async function EnquiryRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/enquiries?open=${encodeURIComponent(id)}`);
}
