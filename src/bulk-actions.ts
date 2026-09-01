// UMD wrapper: emits `module.exports` (CommonJS for node --test)
// and `root.BulkEmployeeOperations` (browser global consumed by index.html).

interface BulkActionEmployee {
  id: string;
  name: string;
  number: string;
  position?: string;
  sueldo?: string;
  paused?: boolean;
  workContextId?: string;
  updatedAt?: string;
  [extra: string]: unknown;
}

interface BulkOperationResult {
  updatedEmployees: BulkActionEmployee[];
  affectedCount: number;
  affectedIds: string[];
}

interface BulkDeleteResult {
  remainingEmployees: BulkActionEmployee[];
  deletedCount: number;
  deletedIds: string[];
}

interface BulkSelectionState {
  selectedIds: Set<string>;
}

interface BulkSelectionManager {
  isSelected(id: string): boolean;
  toggle(id: string): boolean;
  setSelected(id: string, selected: boolean): void;
  selectAll(ids: string[]): void;
  deselectAll(): void;
  getSelectedIds(): string[];
  getSelectedCount(): number;
  isAllSelected(allIds: string[]): boolean;
}

(function (root: any, factory: any) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BulkEmployeeOperations = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function bulkSetPaused(
    employees: BulkActionEmployee[],
    ids: string[],
    paused: boolean,
    nowISO?: string
  ): BulkOperationResult {
    const targetSet = new Set(ids);
    const ts = nowISO || new Date().toISOString();
    let affectedCount = 0;
    const affectedIds: string[] = [];

    const updatedEmployees = employees.map(emp => {
      if (targetSet.has(emp.id)) {
        if (!!emp.paused !== paused) {
          affectedCount++;
          affectedIds.push(emp.id);
          return {
            ...emp,
            paused,
            updatedAt: ts
          };
        }
      }
      return emp;
    });

    return {
      updatedEmployees,
      affectedCount,
      affectedIds
    };
  }

  function bulkAssignContext(
    employees: BulkActionEmployee[],
    ids: string[],
    workContextId: string | null,
    nowISO?: string
  ): BulkOperationResult {
    const targetSet = new Set(ids);
    const ts = nowISO || new Date().toISOString();
    let affectedCount = 0;
    const affectedIds: string[] = [];

    const updatedEmployees = employees.map(emp => {
      if (targetSet.has(emp.id)) {
        const nextContextId = workContextId ? workContextId : undefined;
        if (emp.workContextId !== nextContextId) {
          affectedCount++;
          affectedIds.push(emp.id);
          const updated = { ...emp, updatedAt: ts };
          if (nextContextId) {
            updated.workContextId = nextContextId;
          } else {
            delete updated.workContextId;
          }
          return updated;
        }
      }
      return emp;
    });

    return {
      updatedEmployees,
      affectedCount,
      affectedIds
    };
  }

  function bulkAssignPosition(
    employees: BulkActionEmployee[],
    ids: string[],
    position: string,
    nowISO?: string
  ): BulkOperationResult {
    const targetSet = new Set(ids);
    const ts = nowISO || new Date().toISOString();
    const cleanPosition = position.trim();
    let affectedCount = 0;
    const affectedIds: string[] = [];

    const updatedEmployees = employees.map(emp => {
      if (targetSet.has(emp.id)) {
        const nextPos = cleanPosition || undefined;
        if ((emp.position || '') !== cleanPosition) {
          affectedCount++;
          affectedIds.push(emp.id);
          const updated = { ...emp, updatedAt: ts };
          if (nextPos) {
            updated.position = nextPos;
          } else {
            delete updated.position;
          }
          return updated;
        }
      }
      return emp;
    });

    return {
      updatedEmployees,
      affectedCount,
      affectedIds
    };
  }

  function bulkDelete(
    employees: BulkActionEmployee[],
    ids: string[]
  ): BulkDeleteResult {
    const targetSet = new Set(ids);
    const deletedIds: string[] = [];
    const remainingEmployees: BulkActionEmployee[] = [];

    employees.forEach(emp => {
      if (targetSet.has(emp.id)) {
        deletedIds.push(emp.id);
      } else {
        remainingEmployees.push(emp);
      }
    });

    return {
      remainingEmployees,
      deletedCount: deletedIds.length,
      deletedIds
    };
  }

  function createBulkSelectionManager(initialIds?: string[]): BulkSelectionManager {
    const selected = new Set<string>(initialIds || []);

    return {
      isSelected(id: string): boolean {
        return selected.has(id);
      },
      toggle(id: string): boolean {
        if (selected.has(id)) {
          selected.delete(id);
          return false;
        } else {
          selected.add(id);
          return true;
        }
      },
      setSelected(id: string, isSel: boolean): void {
        if (isSel) selected.add(id);
        else selected.delete(id);
      },
      selectAll(ids: string[]): void {
        ids.forEach(id => selected.add(id));
      },
      deselectAll(): void {
        selected.clear();
      },
      getSelectedIds(): string[] {
        return Array.from(selected);
      },
      getSelectedCount(): number {
        return selected.size;
      },
      isAllSelected(allIds: string[]): boolean {
        if (!allIds || allIds.length === 0) return false;
        return allIds.every(id => selected.has(id));
      }
    };
  }

  return {
    bulkSetPaused,
    bulkAssignContext,
    bulkAssignPosition,
    bulkDelete,
    createBulkSelectionManager
  };
});
