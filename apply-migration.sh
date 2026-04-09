#!/bin/bash

echo "Applying subscription schema fix..."
echo "Please run the following SQL in your Supabase SQL editor:"
echo ""
cat fix-subscriptions-schema.sql
echo ""
echo "After running the SQL, the subscription functionality should work properly."
echo "You can test it by visiting an agent page and clicking the subscribe button."
