import React, {useState, useEffect} from 'react'
import {useParams, Link} from 'react-router-dom'  //useParams React Router hook hai jo URL me jo dynamic values hoti hain unko read karne ke kaam aata hai.
import documentService from '../../services/documentService'
import Spinner from '../../components/common/Spinner'
import toast from 'react-hot-toast'
import {ArrowLeft, ExternalLink } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader'
import Tabs from '../../components/common/Tabs'
import ChatInterface from '../../components/chat/ChatInterface'
import AIActions from '../../components/ai/AIActions'
import FlashcardManager from '../../components/flashcards/FlashcardManager'
import QuizManager from '../../components/quizzes/QuizManager'

const DocumentDetailPage = () => {

  const {id}=useParams()
  const [document, setDocument]=useState(null)
  const [loading,setLoading]=useState(true)
  const [activeTab, setActiveTab]=useState('Content')  //activeTab → kaunsa tab open hai

  useEffect(()=>{
    const fetchDocumentDetails=async ()=>{
      try{
        const data=await documentService.getDocumentById(id);
        setDocument(data)
      }catch(error){
        toast.error('Failed to fetch document details')
        console.error(error)
      }finally{
        setLoading(false)
      }
    }
    fetchDocumentDetails()
  },[id])  //jb-jb id me change aayega tb-tb mera document fetch hoga
  
  //Helper function to get the full PDF URL
  const getPDFUrl=()=>{
    if(!document?.data?.filePath) return null;

    const filePath=document.data.filePath;

    if(filePath.startsWith('https://') || (filePath.startsWith('http://'))){
      return filePath
    }
   // REACT_APP_API_URL is an environment variable present in .env file
    const baseUrl=process.env.REACT_APP_API_URL || 'http://localhost:8000';
    return `${baseUrl}${filePath.startsWith('/') ? '' : '/'}${filePath}`
  }

  const renderContent=()=>{
    if(loading){
      return <Spinner />
    }
    if(!document || !document.data || !document.data.filePath){
      return <div className="text-center p-8">PDF not available</div>
    }

    const pdfUrl=getPDFUrl()

    return (
      <div className='bg-white border border-gray-300 rounded-lg overflow-hidden shadow-sm'>
        <div className='flex items-center justify-between p-4 bg-gray-50 border-b border-gray-300'>
          <span className='text-sm font-medium text-gray-700'>Document Viewer</span>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className='inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors'
            >
              <ExternalLink size={16} />
              Open in new tab
            </a>
        </div>
        <div className='bg-gray-100 p-1'>
          <iframe
            src={pdfUrl}
            className='w-full h-[70vh] bg-white rounded border border-gray-300 '
            title="PDF Viewer"
            // frameBorder="0"
            style={{
              border:"none",
              colorScheme:'light'
            }}
            />
        </div>
      </div>
    )
  }

  const renderChat=()=>{
    return <ChatInterface/>
  }

  const renderAIActions=()=>{
    return <AIActions/>
  }

  const renderFlashcardsTab=()=>{
    return <FlashcardManager documentId={id}/>
  }
  const renderQuizzesTab=()=>{
    return <QuizManager documentId={id}/>
  }

  const tabs=[
    {name:'Content',label:'Content',content:renderContent()},
    {name:'Chat',label:'Chat',content:renderChat()},
    {name:'AI Actions',label:'AI Actions',content:renderAIActions()},
    {name:'Flashcards',label:'Flashcards',content:renderFlashcardsTab()},
    {name:'Quizzes',label:'Quizzes',content:renderQuizzesTab()},
  ]
  if(loading){
    return <Spinner/>
  }
  if(!document){
    return <div className="text-center p-8">Document not found</div>
  }

  return (
    <div>
      <div className='mb-4'>
        <Link to="/documents" className='inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors'>
          <ArrowLeft size={16} />
          Back to Documents
        </Link>
      </div>
      <PageHeader title={document.data.title} />
      <Tabs tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab}/>
    </div>
  )
}

export default DocumentDetailPage


/**
 * ✅ 2️⃣ iframe
✔️ Dusra webpage / PDF / video same page ke andar hi embed karta hai
✔️ Page change nahi hota
✔️ “Website inside website” type

✅ 1️⃣ href (<a> tag)
✔️ Clicking par page change / redirect karta hai
✔️ User ko dusre page / website par le jaata hai
✔️ Current page se bahar nikal jate ho


******************************************************

noopener
New tab window.opener ka access nahi le sakta
➡️ Security fix 🔒

noreferrer
Referer header hide karta hai
Matlab new site ko nahi pata chalta tum kis page se aaye
 */