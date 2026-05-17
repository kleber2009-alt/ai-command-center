import MeDocumentDetail from './MeDocumentDetail'

export default function MeDocumentDetailPage({ params }: { params: { id: string } }) {
  return <MeDocumentDetail id={params.id} />
}
