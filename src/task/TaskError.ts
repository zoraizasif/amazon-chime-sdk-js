// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/*
 * [[TaskError]] provides common utilities for task implementations.
 */
export default class TaskError extends Error {
  constructor(
    message: string,
    public failedTasks?: ({ name: string, message: string })[]
  ) {
    super(message);
    Object.setPrototypeOf(this, TaskError.prototype);
  }
}
