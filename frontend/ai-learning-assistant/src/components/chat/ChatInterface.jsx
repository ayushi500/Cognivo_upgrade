import React, { useState, useEffect, useRef } from 'react'
import { Send, MessageSquare, Sparkles, Square } from 'lucide-react'
import { useParams, Link } from 'react-router-dom'
import aiService from '../../services/aiService'
import { useAuth } from '../../context/AuthContext'
import Spinner from '../common/Spinner'
import MarkdownRenderer from '../common/MarkdownRenderer.jsx'

const ChatInterface = () => {
    const { id: documentId } = useParams()
    const { user } = useAuth()

    const [history, setHistory] = useState([])
    const [message, setMessage] = useState('')
    const [loading, setLoading] = useState(false)
    const [initialLoading, setInitialLoading] = useState(true)
    const [status, setStatus] = useState('')

    const messagesEndRef = useRef(null)
    const abortRef = useRef(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        const fetchChatHistory = async () => {
            try {
                setInitialLoading(true)

                const response = await aiService.getChatHistory(documentId)
                setHistory(response.data)
            } catch (error) {
                console.error('Failed to fetch chat History', error)
            } finally {
                setInitialLoading(false)
            }
        }

        fetchChatHistory()
    }, [documentId])

    useEffect(() => {
        scrollToBottom()
    }, [history])

    const handleStop = () => {
        abortRef.current?.abort()
    }

    const handleSendMessage = async (e) => {
        e.preventDefault()

        if (!message.trim() || loading) return

        const question = message.trim()

        const userMessage = {
            role: 'user',
            content: question,
            timestamp: new Date()
        }

        setHistory(prev => [...prev, userMessage])
        setMessage('')
        setLoading(true)
        setStatus('')

        // Normal RAG chat with streaming
        const controller = new AbortController()
        abortRef.current = controller

        let started = false

        // Add an empty assistant bubble when the first token arrives
        // and keep appending streamed tokens to it.
        const appendToken = (text) => {
            setHistory(prev => {
                if (!started) {
                    started = true

                    return [
                        ...prev,
                        {
                            role: 'assistant',
                            content: text,
                            timestamp: new Date(),
                            streaming: true
                        }
                    ]
                }

                const copy = [...prev]
                const last = copy[copy.length - 1]

                copy[copy.length - 1] = {
                    ...last,
                    content: last.content + text
                }

                return copy
            })
        }

        try {
            await aiService.chatStream(
                documentId,
                question,
                {
                    onStatus: (text) => {
                        setStatus(text)
                    },

                    onToken: appendToken,

                    onDone: (data) => {
                        // Replace streamed message with final answer + sources
                        setHistory(prev => {
                            const finalMsg = {
                                role: 'assistant',
                                content: data.answer,
                                timestamp: new Date(),
                                relevantChunks: data.relevantChunks,
                                sources: data.sources || []
                            }

                            if (!started) {
                                return [...prev, finalMsg]
                            }

                            const copy = [...prev]
                            copy[copy.length - 1] = finalMsg

                            return copy
                        })

                        started = true
                    },

                    onError: (msg) => {
                        setHistory(prev => [
                            ...prev,
                            {
                                role: 'assistant',
                                content:
                                    msg ||
                                    'Sorry, I encountered an error. Please try again.',
                                timestamp: new Date()
                            }
                        ])

                        started = true
                    }
                },
                controller.signal
            )
        } catch (error) {
            if (error?.name === 'AbortError') {
                // User pressed Stop.
                // Keep whatever text has already arrived.
                setHistory(prev => {
                    const copy = [...prev]
                    const last = copy[copy.length - 1]

                    if (last?.streaming) {
                        copy[copy.length - 1] = {
                            ...last,
                            streaming: false,
                            content: last.content + ' …(stopped)'
                        }
                    }

                    return copy
                })
            } else {
                console.error('Chat error', error)

                setHistory(prev => [
                    ...prev,
                    {
                        role: 'assistant',
                        content:
                            'Sorry, I encountered an error. Please try again.',
                        timestamp: new Date()
                    }
                ])
            }
        } finally {
            abortRef.current = null
            setLoading(false)
            setStatus('')
        }
    }

    const renderMessage = (msg, index) => {
        const isUser = msg.role === 'user'

        return (
            <div
                key={index}
                className={`flex items-start gap-3 my-4 ${
                    isUser ? 'justify-end' : ''
                }`}
            >
                {!isUser && (
                    <div className="w-9 h-9 rounded-xl bg-linear-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/25 flex items-center justify-center shrink-0">
                        <Sparkles
                            className="w-4 h-4 text-white"
                            strokeWidth={2}
                        />
                    </div>
                )}

                <div
                    className={`max-w-lg p-4 rounded-2xl shadow-sm ${
                        isUser
                            ? 'bg-linear-to-br from-emerald-500 to-teal-500 text-white rounded-br-md'
                            : 'bg-white border border-slate-200/60 text-slate-800 rounded-bl-md'
                    }`}
                >
                    {isUser ? (
                        <p className="text-sm leading-relaxed">
                            {msg.content}
                        </p>
                    ) : (
                        <div>
                            <div className="prose prose-sm max-w-none prose-slate">
                                <MarkdownRenderer content={msg.content} />
                            </div>

                            {msg.sources && msg.sources.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-slate-200">
                                    <p className="text-xs font-semibold text-slate-500 mb-2">
                                        Sources
                                    </p>

                                    <div className="flex flex-wrap gap-2">
                                        {msg.sources.map(
                                            (source, sourceIndex) => (
                                                <span
                                                    key={sourceIndex}
                                                    title={
                                                        source.snippet || ''
                                                    }
                                                    className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 cursor-help"
                                                >
                                                    📄 Page{' '}
                                                    {source.pageNumber}
                                                    {source.heading
                                                        ? ` · ${source.heading.slice(
                                                              0,
                                                              28
                                                          )}`
                                                        : ''}
                                                </span>
                                            )
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {isUser && (
                    <div className="w-9 h-9 rounded-xl bg-linear-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-700 font-semibold text-sm shrink-0 shadow-sm">
                        {user?.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                )}
            </div>
        )
    }

    if (initialLoading) {
        return (
            <div className="flex flex-col h-[70vh] bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-2xl items-center justify-center shadow-xl shadow-slate-200/50">
                <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-emerald-100 to-teal-100 flex items-center justify-center mb-4">
                    <MessageSquare
                        className="w-7 h-7 text-emerald-600"
                        strokeWidth={2}
                    />
                </div>

                <Spinner />

                <p className="text-sm text-slate-500 mt-3 font-medium">
                    Loading chat history...
                </p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-[70vh] bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden">

            {/* Message Area */}
            <div className="flex-1 p-6 overflow-y-auto bg-linear-to-br from-slate-50/50 via-white/50 to-slate-50/50">

                {history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">

                        <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-emerald-100 to-teal-100 flex items-center justify-center mb-4 shadow-emerald-500/10">
                            <MessageSquare
                                className="w-8 h-8 text-emerald-600"
                                strokeWidth={2}
                            />
                        </div>

                        <h3 className="text-base font-semibold text-slate-900 mb-2">
                            Start a conversation
                        </h3>

                        <p className="text-sm text-slate-500">
                            Ask me anything about the document!
                        </p>

                    </div>
                ) : (
                    history.map(renderMessage)
                )}

                <div ref={messagesEndRef} />

                {loading &&
                    !history[history.length - 1]?.streaming && (
                        <div className="flex items-center gap-3 my-4">

                            <div className="w-9 h-9 rounded-xl bg-linear-to-br from-emerald-400 to-teal-500 shadow-emerald-500/25 flex items-center justify-center shrink-0">
                                <Sparkles
                                    className="w-4 h-4 text-white"
                                    strokeWidth={2}
                                />
                            </div>

                            <div className="flex items-center gap-2 px-4 py-2 rounded-bl-md bg-white border border-slate-200/60">

                                <div className="flex gap-1">
                                    <span
                                        className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                                        style={{
                                            animationDelay: '0ms'
                                        }}
                                    />

                                    <span
                                        className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                                        style={{
                                            animationDelay: '150ms'
                                        }}
                                    />

                                    <span
                                        className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                                        style={{
                                            animationDelay: '300ms'
                                        }}
                                    />
                                </div>

                                {status && (
                                    <span className="text-xs text-slate-500">
                                        {status}
                                    </span>
                                )}

                            </div>
                        </div>
                    )}
            </div>

            {/* Input Area */}
            <div className="p-5 border-t border-slate-200/60 bg-white/80">

                <form
                    onSubmit={handleSendMessage}
                    className="flex items-center gap-3"
                >

                    <input
                        type="text"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Ask a follow-up question..."
                        className="flex-1 h-12 px-4 border-2 border-slate-200 rounded-xl bg-slate-50/50 text-slate-900 placeholder-slate-400 text-sm font-medium transition-all duration-200 focus:outline-none focus:border-emerald-500 focus:bg-white focus:shadow-lg focus:shadow-emerald-500/10"
                        disabled={loading}
                    />

                    {loading ? (
                        <button
                            type="button"
                            onClick={handleStop}
                            title="Stop generating"
                            className="shrink-0 w-12 h-12 bg-slate-800 hover:bg-slate-900 text-white rounded-xl transition-all duration-200 active:scale-95 flex items-center justify-center"
                        >
                            <Square
                                className="w-4 h-4"
                                strokeWidth={2}
                                fill="currentColor"
                            />
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={loading || !message.trim()}
                            className="shrink-0 w-12 h-12 bg-linear-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 flex items-center justify-center"
                        >
                            <Send
                                className="w-5 h-5"
                                strokeWidth={2}
                            />
                        </button>
                    )}

                </form>
            </div>
        </div>
    )
}

export default ChatInterface;
