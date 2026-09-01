"use strict";
// UMD wrapper: emits `module.exports` (CommonJS for node --test)
// and `root.BulkEmployeeOperations` (browser global consumed by index.html).
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    }
    else {
        root.BulkEmployeeOperations = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    function bulkSetPaused(employees, ids, paused, nowISO) {
        const targetSet = new Set(ids);
        const ts = nowISO || new Date().toISOString();
        let affectedCount = 0;
        const affectedIds = [];
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
    function bulkAssignContext(employees, ids, workContextId, nowISO) {
        const targetSet = new Set(ids);
        const ts = nowISO || new Date().toISOString();
        let affectedCount = 0;
        const affectedIds = [];
        const updatedEmployees = employees.map(emp => {
            if (targetSet.has(emp.id)) {
                const nextContextId = workContextId ? workContextId : undefined;
                if (emp.workContextId !== nextContextId) {
                    affectedCount++;
                    affectedIds.push(emp.id);
                    const updated = { ...emp, updatedAt: ts };
                    if (nextContextId) {
                        updated.workContextId = nextContextId;
                    }
                    else {
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
    function bulkAssignPosition(employees, ids, position, nowISO) {
        const targetSet = new Set(ids);
        const ts = nowISO || new Date().toISOString();
        const cleanPosition = position.trim();
        let affectedCount = 0;
        const affectedIds = [];
        const updatedEmployees = employees.map(emp => {
            if (targetSet.has(emp.id)) {
                const nextPos = cleanPosition || undefined;
                if ((emp.position || '') !== cleanPosition) {
                    affectedCount++;
                    affectedIds.push(emp.id);
                    const updated = { ...emp, updatedAt: ts };
                    if (nextPos) {
                        updated.position = nextPos;
                    }
                    else {
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
    function bulkDelete(employees, ids) {
        const targetSet = new Set(ids);
        const deletedIds = [];
        const remainingEmployees = [];
        employees.forEach(emp => {
            if (targetSet.has(emp.id)) {
                deletedIds.push(emp.id);
            }
            else {
                remainingEmployees.push(emp);
            }
        });
        return {
            remainingEmployees,
            deletedCount: deletedIds.length,
            deletedIds
        };
    }
    function createBulkSelectionManager(initialIds) {
        const selected = new Set(initialIds || []);
        return {
            isSelected(id) {
                return selected.has(id);
            },
            toggle(id) {
                if (selected.has(id)) {
                    selected.delete(id);
                    return false;
                }
                else {
                    selected.add(id);
                    return true;
                }
            },
            setSelected(id, isSel) {
                if (isSel)
                    selected.add(id);
                else
                    selected.delete(id);
            },
            selectAll(ids) {
                ids.forEach(id => selected.add(id));
            },
            deselectAll() {
                selected.clear();
            },
            getSelectedIds() {
                return Array.from(selected);
            },
            getSelectedCount() {
                return selected.size;
            },
            isAllSelected(allIds) {
                if (!allIds || allIds.length === 0)
                    return false;
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
