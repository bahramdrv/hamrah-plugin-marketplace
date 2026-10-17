import { KnowledgeSearch } from '../../src/knowledge/page';
import { knowledgeDocuments } from '../../src/knowledge/retrieval';
export const metadata = { title: 'راهنمای استفاده | کوچ' };
export default function Page() { return <KnowledgeSearch documents={knowledgeDocuments} />; }
