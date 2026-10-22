/* Spark-compatible enquiry submission. The rules enforce the same-email cooldown.
 * No API keys, mail credentials, Cloud Functions or billing upgrade required. */
(() => {
  'use strict';
  const pending = new Map();
  async function submit(db, input) {
    const data = {...input, email:String(input.email || '').trim().toLowerCase()};
    if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(data.email)) throw Error('validation');
    const key = data.email;
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      const enquiry = db.collection('bookingEnquiries').doc();
      const limit = db.collection('publicBookingLimits').doc(key);
      const batch = db.batch();
      batch.set(enquiry, data);
      batch.set(limit, {enquiryId:enquiry.id, submittedAt:firebase.firestore.FieldValue.serverTimestamp()});
      await batch.commit();
      return enquiry;
    })();
    pending.set(key, work);
    try { return await work; } finally { pending.delete(key); }
  }
  window.LKBooking = Object.freeze({submit});
})();
