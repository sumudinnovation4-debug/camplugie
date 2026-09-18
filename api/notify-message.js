// POST { conversation_id, message_id }
// Called by chat-thread.html right after a message insert succeeds (fire-and-
// forget — never blocks sending, never shown to the sender if it fails).
//
// Looks the message and conversation up server-side (never trusts client-
// supplied content, so this can't be used to email arbitrary text to
// strangers), figures out who the *other* person in the conversation is,
// and fires their in-app notification + email using notifySeller() from
// _lib.js — that helper works for any user id, not just sellers.
const { supabaseAdmin, setCors, notifySeller } = require('./_lib');

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { conversation_id, message_id } = req.body;
    if (!conversation_id || !message_id) {
      return res.status(400).json({ error: 'Missing conversation_id or message_id' });
    }

    const sb = supabaseAdmin();

    const { data: message } = await sb
      .from('messages')
      .select('sender_id, content')
      .eq('id', message_id)
      .eq('conversation_id', conversation_id)
      .single();
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const { data: convo } = await sb
      .from('conversations')
      .select('buyer_id, seller_id, listings(title)')
      .eq('id', conversation_id)
      .single();
    if (!convo) return res.status(404).json({ error: 'Conversation not found' });

    const recipientId = message.sender_id === convo.buyer_id ? convo.seller_id : convo.buyer_id;
    if (!recipientId || recipientId === message.sender_id) {
      return res.status(200).json({ ok: true, skipped: true }); // shouldn't happen, but never email yourself
    }

    const { data: sender } = await sb.from('profiles').select('full_name, username').eq('id', message.sender_id).maybeSingle();
    const senderName = sender?.full_name || sender?.username || 'Someone';
    const preview = (message.content || '').slice(0, 140);
    const listingTag = convo.listings?.title ? ` (about "${convo.listings.title}")` : '';

    await notifySeller(sb, {
      sellerId: recipientId,
      type: 'message',
      title: `New message from ${senderName}`,
      body: `${preview}${listingTag}\n\nReply on Camplugie: https://camplugie.com/chat-thread.html?id=${conversation_id}`,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('notify-message error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
