import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Can } from '../../context/AbilityContext';

export default function ShrenoIncomingTable({ incomings, handleDelete, bottleFilter }) {
  // Process and group the data
  const groupedData = useMemo(() => {
    if (!incomings || !incomings.length) return [];
    
    // Sort incomings by poNo (if exists), then by date
    const sortedIncomings = [...incomings].sort((a, b) => {
      const poA = a.poNo || `no-po-${a._id}`;
      const poB = b.poNo || `no-po-${b._id}`;
      if (poA !== poB) return poA.localeCompare(poB);
      return new Date(a.date) - new Date(b.date);
    });

    const groups = [];
    let currentPo = null;
    let currentGroup = null;
    let srNoCounter = 1;

    sortedIncomings.forEach(inc => {
      // In this system, each incoming record can have multiple items
      // We will flatten them into challanRows for easier rendering
      let validItems = inc.items;
      if (bottleFilter) {
        validItems = inc.items.filter(item => {
          const itemBottleId = item.bottleId?._id || item.bottleId;
          return itemBottleId === bottleFilter;
        });
      }
      if (validItems.length === 0) return;

      validItems.forEach(item => {
        const groupKey = inc.poNo || `no-po-${inc._id}`;

        if (groupKey !== currentPo) {
          currentPo = groupKey;
          currentGroup = {
            srNo: srNoCounter++,
            poDate: inc.poDate,
            poNo: inc.poNo,
            poOrderQty: inc.poOrderQty || 0,
            challanRows: []
          };
          groups.push(currentGroup);
        }
        
        currentGroup.challanRows.push({
          id: inc._id,
          date: inc.documentDate || inc.createdAt,
          deliveryNumber: inc.deliveryNumber,
          bottleName: item.bottleId?.bottleName || 'Unknown',
          box: item.box || 0,
          qtyPerBox: item.qty || 0,
          totalQty: item.totalQty || 0
        });
      });
    });

    return groups;
  }, [incomings]);

  // Calculate totals
  const totals = useMemo(() => {
    let totalPoOrderQty = 0;
    let totalBox = 0;
    let totalIncomingQty = 0;

    groupedData.forEach(group => {
      totalPoOrderQty += group.poOrderQty; // Summed ONCE per PO group
      group.challanRows.forEach(row => {
        totalBox += row.box;
        totalIncomingQty += row.totalQty;
      });
    });

    return { totalPoOrderQty, totalBox, totalIncomingQty };
  }, [groupedData]);

  return (
    <div className="table-responsive companies-list-desktop">
      <table className="data-table">
        <thead>
          <tr>
            <th className="py-3 text-uppercase small fw-bold text-muted ps-4 text-center">Sr No</th>
            <th className="py-3 text-uppercase small fw-bold text-muted text-center">PO Date</th>
            <th className="py-3 text-uppercase small fw-bold text-muted text-center">PO No</th>
            <th className="py-3 text-uppercase small fw-bold text-muted text-center">PO Order Qty</th>
            <th className="py-3 text-uppercase small fw-bold text-muted">Description</th>
            <th className="py-3 text-uppercase small fw-bold text-muted">Date</th>
            <th className="py-3 text-uppercase small fw-bold text-muted">Challan No</th>
            <th className="py-3 text-uppercase small fw-bold text-muted text-center">No of box</th>
            <th className="py-3 text-uppercase small fw-bold text-muted text-center">Qty</th>
            <th className="py-3 text-uppercase small fw-bold text-muted text-center">Incoming Qty</th>
            <th className="py-3 text-uppercase small fw-bold text-muted text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          {groupedData.map((group) => {
            return group.challanRows.map((row, idx) => (
              <tr key={`${row.id}-${idx}`} className="align-middle border-bottom transition-all hover-bg-light">
                {idx === 0 && (
                  <>
                    <td className="py-3 ps-4 text-center fw-bold" rowSpan={group.challanRows.length}>
                      {group.srNo}
                    </td>
                    <td className="py-3 text-center" rowSpan={group.challanRows.length}>
                      {group.poDate ? new Date(group.poDate).toLocaleDateString('en-GB') : '-'}
                    </td>
                    <td className="py-3 text-center fw-bold text-primary" rowSpan={group.challanRows.length}>
                      {group.poNo || '-'}
                    </td>
                    <td className="py-3 text-center fw-bold" rowSpan={group.challanRows.length}>
                      {group.poOrderQty ? group.poOrderQty.toLocaleString() : '-'}
                    </td>
                  </>
                )}
                <td className="py-3">
                  <div className="d-flex align-items-center gap-2">
                    <span className="fw-500">{row.bottleName}</span>
                  </div>
                </td>
                <td className="py-3 text-muted">
                  {row.date ? new Date(row.date).toLocaleDateString('en-GB') : '-'}
                </td>
                <td className="py-3">
                  <span className="fw-500">{row.deliveryNumber}</span>
                </td>
                <td className="py-3 text-center fw-500">{row.box}</td>
                <td className="py-3 text-center text-muted">{row.qtyPerBox}</td>
                <td className="py-3 text-center fw-bold text-success">{row.totalQty.toLocaleString()}</td>
                <td className="py-3 text-center">
                  <Can I="read" a="incoming">
                    <Link to={`/incoming/view/${row.id}`} className="btn btn-sm btn-outline-info border-0 rounded-3 shadow-none p-2 mx-1" title="View">
                      <i className="bi bi-eye" style={{ fontSize: '14px' }}></i>
                    </Link>
                  </Can>
                  <Can I="update" a="incoming">
                    <Link to={`/incoming/edit/${row.id}`} className="btn btn-sm btn-outline-primary border-0 rounded-3 shadow-none p-2 mx-1" title="Edit">
                      <i className="bi bi-pencil-square" style={{ fontSize: '14px' }}></i>
                    </Link>
                  </Can>
                  <Can I="delete" a="incoming">
                    <button onClick={() => handleDelete(row.id, row.deliveryNumber)} className="btn btn-sm btn-outline-danger border-0 rounded-3 shadow-none p-2 mx-1" title="Delete">
                      <i className="bi bi-trash" style={{ fontSize: '14px' }}></i>
                    </button>
                  </Can>
                </td>
              </tr>
            ));
          })}
          
          {/* Totals Row */}
          {groupedData.length > 0 && (
            <tr className="bg-light fw-bold">
              <td colSpan={3} className="py-3 text-end">TOTAL</td>
              <td className="py-3 text-center text-primary fs-6">{totals.totalPoOrderQty.toLocaleString()}</td>
              <td colSpan={3}></td>
              <td className="py-3 text-center fs-6">{totals.totalBox.toLocaleString()}</td>
              <td></td>
              <td className="py-3 text-center text-success fs-6">{totals.totalIncomingQty.toLocaleString()}</td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
