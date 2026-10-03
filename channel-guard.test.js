'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectWrongChannelMessage } = require('./channel-guard');

const channelMap = {
  jobTracking: 'c_jobs',
  jobTaskUpdates: 'c_tasks',
  interviewUpdates: 'c_interviews',
  issues: 'c_issues',
  supervisor: 'c_admin',
};

test('detectWrongChannelMessage ignores supervisor channel and commands', () => {
  assert.equal(detectWrongChannelMessage('!leave', 'c_discussion', channelMap), null);
  assert.equal(detectWrongChannelMessage('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit', 'c_admin', channelMap), null);
  assert.equal(detectWrongChannelMessage('hello everyone how are you', 'c_discussion', channelMap), null);
});

test('detects Google Sheet tracker link posted outside job-tracking channel', () => {
  const link = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?gid=0';
  
  // In discussion -> wrong
  const wrong = detectWrongChannelMessage(link, 'c_discussion', channelMap);
  assert.ok(wrong);
  assert.equal(wrong.type, 'job_sheet');
  assert.equal(wrong.targetChannelId, 'c_jobs');

  // In jobs channel -> correct
  assert.equal(detectWrongChannelMessage(link, 'c_jobs', channelMap), null);
});

test('detects Job Task update posted outside job-task-update channel', () => {
  const taskMsg = `Candidate Name: John Doe
Company Name: Acme Corp
Designation: React Dev
Task Deadline: 2026-10-15`;

  // In discussion -> wrong
  const wrong = detectWrongChannelMessage(taskMsg, 'c_discussion', channelMap);
  assert.ok(wrong);
  assert.equal(wrong.type, 'job_task');
  assert.equal(wrong.targetChannelId, 'c_tasks');

  // In task channel -> correct
  assert.equal(detectWrongChannelMessage(taskMsg, 'c_tasks', channelMap), null);
});

test('detects Interview announcement posted outside interview-update channel', () => {
  const interviewMsg = `Interview Serial: 1st
Company: Tech Innovators
Role: MERN Developer
Date: October 10
Time: 4:00 PM
Location: Remote`;

  // In discussion -> wrong
  const wrong = detectWrongChannelMessage(interviewMsg, 'c_discussion', channelMap);
  assert.ok(wrong);
  assert.equal(wrong.type, 'interview');
  assert.equal(wrong.targetChannelId, 'c_interviews');

  // In interview channel -> correct
  assert.equal(detectWrongChannelMessage(interviewMsg, 'c_interviews', channelMap), null);
});

test('detects unstructured leave request with dates outside issues channel', () => {
  const leaveMsg = 'Leave request: I need leave from 2026-10-10 to 2026-10-12 due to family emergency';
  const wrong = detectWrongChannelMessage(leaveMsg, 'c_discussion', channelMap);
  assert.ok(wrong);
  assert.equal(wrong.type, 'leave_request');
  assert.equal(wrong.targetChannelId, 'c_issues');

  // In issues channel -> correct
  assert.equal(detectWrongChannelMessage(leaveMsg, 'c_issues', channelMap), null);
});
